import sys, time
sys.path.insert(0,".")
from slm import usb, protocol as P
from slm.config import AppSettings
from slm.device import DeviceController

events=[]
ctrl = DeviceController(usb.HidTransport(), AppSettings.load(), events.append)
ctrl.connect()

def show(tag):
    m = ctrl.read_once()
    print(f"{tag}: value={m.value} mode={m.mode} weight={m.weighting} range={m.range} max={m.max_hold} batt={m.battery_low}")

show("avant     ")
print("écriture  mode=FAST weight=C max=True range=3")
print("  ok =", ctrl.write_settings("FAST", True, "C", 3))
time.sleep(0.5)
show("après     ")
print("restauration mode=SLOW weight=A max=False range=0")
ctrl.write_settings("SLOW", False, "A", 0)
time.sleep(0.4)
show("restauré  ")
ctrl.disconnect()
