package fr.bitansono.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Coquille de la webapp.
 *
 * <p>La page n'est pas chargée depuis {@code file://} : les modules ES y sont
 * refusés par CORS. Elle est donc servie depuis une origine {@code https://}
 * virtuelle, interceptée en mémoire — ce qui la place en « contexte
 * sécurisé » et autorise les modules, le localStorage et le service worker,
 * exactement comme sur un serveur.
 */
public class MainActivity extends Activity {

    private static final String ORIGIN = "https://appassets.local/";
    private static final String WEB_ROOT = "web/";
    /** Script injecté dans l'en-tête de la page : installe window.BitanBridge. */
    private static final Pattern HEAD = Pattern.compile("<head[^>]*>", Pattern.CASE_INSENSITIVE);

    private WebView web;
    private UsbBridge bridge;
    private String shim;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        shim = readAsset("bridge.js");

        web = new WebView(this);
        web.setBackgroundColor(0xFF14161A);
        setContentView(web);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true); // réglages, thème, dosimètre
        settings.setMediaPlaybackRequiresUserGesture(false); // alarmes sonores
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);

        bridge = new UsbBridge(this, web);
        web.addJavascriptInterface(bridge, "__bitanNative");

        web.setWebViewClient(
                new WebViewClient() {
                    @Override
                    public WebResourceResponse shouldInterceptRequest(
                            WebView view, WebResourceRequest request) {
                        return serve(request.getUrl().toString());
                    }

                    @Override
                    public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                        super.onPageStarted(view, url, icon);
                        // Filet de sécurité : la même passerelle, posée dès le
                        // début du document. La garde du shim la rend inoffensive
                        // si l'injection dans l'en-tête a déjà eu lieu.
                        if (shim != null && !shim.isEmpty()) {
                            view.evaluateJavascript(shim, null);
                        }
                    }
                });

        web.loadUrl(ORIGIN + "index.html");
    }

    /* ----------------------------------------------------- assets de l'APK */

    /** Sert les fichiers embarqués depuis l'origine https:// virtuelle. */
    private WebResourceResponse serve(String url) {
        if (!url.startsWith(ORIGIN)) return null;

        String path = url.substring(ORIGIN.length());
        int cut = path.indexOf('?');
        if (cut >= 0) path = path.substring(0, cut);
        cut = path.indexOf('#');
        if (cut >= 0) path = path.substring(0, cut);
        if (path.isEmpty()) path = "index.html";
        // Garde de traversée : tout chemin exotique est refusé.
        if (path.contains("..") || !path.matches("[A-Za-z0-9._/-]+")) return notFound();

        String asset = "bridge.js".equals(path) ? "bridge.js" : WEB_ROOT + path;
        try {
            if (asset.endsWith("index.html")) {
                String html = inject(readAsset(asset));
                return new WebResourceResponse(
                        "text/html",
                        "utf-8",
                        new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8)));
            }
            InputStream stream = getAssets().open(asset);
            String mime = mimeOf(path);
            String charset = mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json")
                    ? "utf-8"
                    : null;
            return new WebResourceResponse(mime, charset, stream);
        } catch (IOException err) {
            return notFound();
        }
    }

    /** Insère le shim juste après la balise &lt;head&gt;. */
    private static String inject(String html) {
        Matcher matcher = HEAD.matcher(html);
        if (!matcher.find()) return html;
        return matcher.replaceFirst(Matcher.quoteReplacement(matcher.group()) + "<script src=\"/bridge.js\"></script>");
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
    }

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            return new String(readAll(in), StandardCharsets.UTF_8);
        } catch (IOException err) {
            return "";
        }
    }

    private static byte[] readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream(64 * 1024);
        byte[] buffer = new byte[8192];
        int read;
        while ((read = in.read(buffer)) > 0) out.write(buffer, 0, read);
        return out.toByteArray();
    }

    /**
     * Type MIME explicite : les modules ES sont refusés si le type est
     * approximatif, et les accents partent en vrille sans charset.
     */
    private static String mimeOf(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "text/javascript";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".webmanifest")) return "application/manifest+json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".ico")) return "image/x-icon";
        return "application/octet-stream";
    }

    /* --------------------------------------------------------------- cycle */

    @Override
    protected void onDestroy() {
        if (bridge != null) bridge.dispose();
        if (web != null) {
            web.removeJavascriptInterface("__bitanNative");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
