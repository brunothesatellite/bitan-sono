package fr.bitansono.app;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.usb.UsbConstants;
import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbDeviceConnection;
import android.hardware.usb.UsbEndpoint;
import android.hardware.usb.UsbInterface;
import android.hardware.usb.UsbManager;
import android.os.Build;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Accès USB natif au sonomètre, exposé au JavaScript de la page.
 *
 * <p>C'est tout l'intérêt de l'APK : le navigateur ne peut pas revendiquer une
 * interface HID, parce qu'Android a un {@code claimInterface()} sans option.
 * Ici on dispose de {@code claimInterface(iface, true)}, documenté « true to
 * disconnect kernel driver if necessary » : le noyau lâche l'interface
 * {@code usbhid} et l'application la prend. C'est exactement ce que le
 * navigateur ne sait pas faire.
 */
public class UsbBridge {

    private static final String TAG = "bitan-bridge";
    private static final int VENDOR_ID = 0x64bd;
    private static final int PRODUCT_ID = 0x74e3;
    private static final String ACTION_PERMISSION = "fr.bitansono.app.USB_PERMISSION";

    /** Longueur du rapport utile : 8 octets (l'identifiant 0 ne circule pas). */
    private static final int REPORT_LEN = 8;
    /** Délai de lecture : assez court pour que la fermeture reste rapide. */
    private static final int READ_TIMEOUT_MS = 200;
    private static final int WRITE_TIMEOUT_MS = 500;

    private final Activity activity;
    private final WebView web;
    private final UsbManager manager;

    private UsbDeviceConnection connection;
    private UsbInterface iface;
    private UsbEndpoint epIn;
    private UsbEndpoint epOut;

    private final LinkedBlockingQueue<byte[]> writes = new LinkedBlockingQueue<>();
    private volatile boolean running;
    private Thread reader;
    private Thread writer;
    private BroadcastReceiver receiver;

    public UsbBridge(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
        this.manager = (UsbManager) activity.getSystemService(Context.USB_SERVICE);
    }

    /* ------------------------------------------------------------ pont JS */

    /**
     * Le sonomètre est-il branché ?
     *
     * <p>Question posée sans effet de bord : ni demande d'autorisation, ni
     * revendication d'interface. La page s'en sert au démarrage pour décider
     * d'ouvrir l'appareil et de partir en écoute d'elle-même.
     */
    @JavascriptInterface
    public boolean present() {
        return findDevice() != null;
    }

    /** Ouvre l'appareil : autorisation si nécessaire, puis revendication. */
    @JavascriptInterface
    public void open() {
        if (running) {
            emitOpen(currentLabel);
            return;
        }
        UsbDevice device = findDevice();
        if (device == null) {
            emitError("Sonomètre introuvable : branchez-le en OTG.");
            return;
        }
        currentLabel = describe(device);
        if (manager.hasPermission(device)) {
            start(device);
            return;
        }
        requestPermission(device);
    }

    /** Dépose une trame de 8 octets dans la file d'écriture (non bloquant). */
    @JavascriptInterface
    public void send(String json) {
        if (!running) return;
        try {
            JSONArray values = new JSONArray(json);
            byte[] frame = new byte[values.length()];
            for (int i = 0; i < values.length(); i++) {
                frame[i] = (byte) (values.getInt(i) & 0xff);
            }
            writes.offer(frame);
        } catch (Exception err) {
            Log.w(TAG, "trame illisible : " + json, err);
        }
    }

    /** Arrête les échanges, relâche l'interface, referme l'appareil. */
    @JavascriptInterface
    public void close() {
        running = false;
        writes.clear();
        // Les transferts en cours rendent la main au bout de READ_TIMEOUT_MS :
        // on attend qu'ils sortent avant de relâcher l'interface, sinon le
        // noyau peut se plaindre d'un transfert sur un point détaché.
        joinQuietly(reader);
        joinQuietly(writer);
        reader = null;
        writer = null;
        if (connection != null) {
            try {
                if (iface != null) connection.releaseInterface(iface);
            } catch (Exception ignored) {
                // la déconnexion a déjà tout emporté
            }
            try {
                connection.close();
            } catch (Exception ignored) {
                // idem
            }
            connection = null;
        }
        iface = null;
        epIn = null;
        epOut = null;
        unregisterReceiver();
    }

    /** Fermeture propre quand l'activité s'en va. */
    public void dispose() {
        close();
    }

    /* ------------------------------------------------------- ouverture USB */

    private String currentLabel = "Sonomètre (OTG)";

    private UsbDevice findDevice() {
        for (UsbDevice device : manager.getDeviceList().values()) {
            if (device.getVendorId() == VENDOR_ID && device.getProductId() == PRODUCT_ID) {
                return device;
            }
        }
        return null;
    }

    private static String describe(UsbDevice device) {
        String name = device.getProductName();
        if (name == null || name.isEmpty()) name = "CH32V10x";
        return name + " · USB";
    }

    private void requestPermission(final UsbDevice device) {
        unregisterReceiver();
        receiver =
                new BroadcastReceiver() {
                    @Override
                    public void onReceive(Context context, Intent intent) {
                        unregisterReceiver();
                        boolean granted =
                                intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false);
                        if (!granted) {
                            emitError("Accès à l'appareil refusé.");
                            return;
                        }
                        // onReceive s'exécute sur le fil de l'IHM : l'ouverture
                        // USB part sur un fil de fond.
                        Thread opening = new Thread(() -> start(device), "bitan-usb-open");
                        opening.setDaemon(true);
                        opening.start();
                    }
                };
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // UsbManager doit pouvoir compléter l'intention : sans mutabilité,
            // la réponse arrive sans le drapeau « accordée ».
            flags |= PendingIntent.FLAG_MUTABLE;
        }
        PendingIntent pending =
                PendingIntent.getBroadcast(
                        activity, 0, new Intent(ACTION_PERMISSION).setPackage(activity.getPackageName()), flags);

        IntentFilter filter = new IntentFilter(ACTION_PERMISSION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            activity.registerReceiver(receiver, filter);
        }
        manager.requestPermission(device, pending);
    }

    private synchronized void start(UsbDevice device) {
        if (running) return;

        iface = pickInterface(device);
        if (iface == null) {
            emitError("Aucune interface interrupt utilisable sur cet appareil.");
            return;
        }
        epIn = null;
        epOut = null;
        for (int i = 0; i < iface.getEndpointCount(); i++) {
            UsbEndpoint endpoint = iface.getEndpoint(i);
            if (endpoint.getType() != UsbConstants.USB_ENDPOINT_XFER_INT) continue;
            if (endpoint.getDirection() == UsbConstants.USB_DIR_IN) epIn = endpoint;
            else epOut = endpoint;
        }
        if (epIn == null) {
            emitError("Aucun point de terminaison d'entrée sur cet appareil.");
            return;
        }

        connection = manager.openDevice(device);
        if (connection == null) {
            emitError("Ouverture de l'appareil impossible.");
            return;
        }

        // Le cœur du sujet : `true` demande au noyau de lâcher son pilote.
        if (!connection.claimInterface(iface, true)) {
            try {
                connection.close();
            } catch (Exception ignored) {
                // rien de plus à faire
            }
            connection = null;
            emitError("Interface refusée par le système, même en forçant.");
            return;
        }

        running = true;
        startReader();
        startWriter();
        Log.i(TAG, "interface " + iface.getId() + " revendiquée, sonomètre ouvert");
        emitOpen(currentLabel);
    }

    /** Préfère l'interface HID complète, sinon la première interface à entrée. */
    private static UsbInterface pickInterface(UsbDevice device) {
        UsbInterface fallback = null;
        for (int i = 0; i < device.getInterfaceCount(); i++) {
            UsbInterface candidate = device.getInterface(i);
            boolean hasIn = false;
            for (int e = 0; e < candidate.getEndpointCount(); e++) {
                UsbEndpoint endpoint = candidate.getEndpoint(e);
                if (endpoint.getType() == UsbConstants.USB_ENDPOINT_XFER_INT
                        && endpoint.getDirection() == UsbConstants.USB_DIR_IN) {
                    hasIn = true;
                    break;
                }
            }
            if (!hasIn) continue;
            if (candidate.getInterfaceClass() == UsbConstants.USB_CLASS_HID) return candidate;
            if (fallback == null) fallback = candidate;
        }
        return fallback;
    }

    /* ------------------------------------------------------------- échanges */

    private void startReader() {
        reader =
                new Thread(
                        () -> {
                            byte[] buffer = new byte[REPORT_LEN];
                            while (running) {
                                int count;
                                try {
                                    count = connection.bulkTransfer(epIn, buffer, buffer.length, READ_TIMEOUT_MS);
                                } catch (Exception err) {
                                    if (running) emitError("Lecture USB interrompue.");
                                    return;
                                }
                                if (!running) return;
                                if (count > 0) {
                                    byte[] frame = new byte[count];
                                    System.arraycopy(buffer, 0, frame, 0, count);
                                    emitData(frame);
                                } else if (count < 0) {
                                    // Délai dépassé : normal, l'appareil est
                                    // muet tant qu'on ne lui demande rien.
                                    continue;
                                }
                            }
                        },
                        "bitan-usb-read");
        reader.setDaemon(true);
        reader.start();
    }

    private void startWriter() {
        writer =
                new Thread(
                        () -> {
                            while (running) {
                                byte[] frame;
                                try {
                                    frame = writes.poll(READ_TIMEOUT_MS, TimeUnit.MILLISECONDS);
                                } catch (InterruptedException err) {
                                    return;
                                }
                                if (frame == null || !running) continue;
                                if (epOut == null) continue;
                                try {
                                    int sent = connection.bulkTransfer(epOut, frame, frame.length, WRITE_TIMEOUT_MS);
                                    if (sent < 0 && running) emitError("Écriture USB refusée.");
                                } catch (Exception err) {
                                    if (running) emitError("Écriture USB interrompue.");
                                }
                            }
                        },
                        "bitan-usb-write");
        writer.setDaemon(true);
        writer.start();
    }

    private static void joinQuietly(Thread thread) {
        if (thread == null) return;
        try {
            thread.join(1000);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }

    /* ------------------------------------------------------ vers JavaScript */

    /** Appelé depuis les fils de lecture : on revient sur le fil de l'IHM. */
    private void js(final String code) {
        web.post(
                () -> {
                    try {
                        web.evaluateJavascript(code, null);
                    } catch (Exception err) {
                        Log.w(TAG, "appel JavaScript impossible", err);
                    }
                });
    }

    private void emitOpen(String label) {
        js("window.__bitanBridge&&window.__bitanBridge.event('open'," + JSONObject.quote(label) + ")");
    }

    private void emitError(String message) {
        js("window.__bitanBridge&&window.__bitanBridge.event('error'," + JSONObject.quote(message) + ")");
    }

    private void emitData(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 4 + 48);
        sb.append("window.__bitanBridge&&window.__bitanBridge.event('data',[");
        for (int i = 0; i < bytes.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(bytes[i] & 0xff);
        }
        sb.append("])");
        js(sb.toString());
    }

    private void unregisterReceiver() {
        if (receiver == null) return;
        try {
            activity.unregisterReceiver(receiver);
        } catch (Exception ignored) {
            // déjà retiré
        }
        receiver = null;
    }
}
