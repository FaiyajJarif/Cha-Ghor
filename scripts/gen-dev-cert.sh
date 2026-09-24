#!/usr/bin/env bash
# Generate a self-signed certificate so the backend can serve HTTPS on the LAN.
#
# ============================================================================
# WHY YOU WANT THIS
# ============================================================================
# Without TLS every JWT, password and 4-digit PIN crosses the wifi in clear
# text. Anyone running a packet capture on the same network can read a token and
# replay it as that user -- no password needed, for 24 hours.
#
# ============================================================================
# WHAT A SELF-SIGNED CERTIFICATE COSTS YOU
# ============================================================================
# Browsers will show a full-page warning the first time, on every device,
# because nothing vouches for this certificate. You accept it once per device.
#
# The WebSocket matters here and is easy to miss: wss:// uses the SAME
# certificate, but the browser will NOT prompt for it. If you have not already
# accepted the warning by visiting the https:// page, the live boards will
# simply fail to connect with no visible error. Load the page first.
#
# For anything real, use a certificate from a CA and set APP_SSL_KEYSTORE.
set -euo pipefail

OUT_DIR="$(cd "$(dirname "$0")/.." && pwd)/backend/src/main/resources"
OUT="$OUT_DIR/dev-keystore.p12"
PASS="${APP_SSL_KEYSTORE_PASSWORD:-changeit}"

if ! command -v keytool >/dev/null 2>&1; then
  echo "keytool not found. It ships with the JDK -- check that java is on your PATH." >&2
  exit 1
fi

if [ -f "$OUT" ]; then
  echo "$OUT already exists. Delete it first if you want a new certificate."
  exit 0
fi

# THE LAN IP GOES IN THE SAN, NOT JUST THE CN.
#
# Modern browsers ignore CN entirely and match the hostname against the Subject
# Alternative Name. A certificate issued only for "localhost" produces a hard
# failure on https://192.168.0.108 that no amount of clicking "proceed" fixes
# on some Android versions. So every address you might use is listed.
LAN_IP="${LAN_IP:-$(ipconfig getifaddr en0 2>/dev/null \
  || hostname -I 2>/dev/null | awk '{print $1}' \
  || echo 127.0.0.1)}"

echo "Issuing a certificate for localhost, 127.0.0.1 and $LAN_IP"
echo "(set LAN_IP=... to override)"

keytool -genkeypair \
  -alias chaghor \
  -keyalg RSA \
  -keysize 2048 \
  -storetype PKCS12 \
  -keystore "$OUT" \
  -storepass "$PASS" \
  -validity 825 \
  -dname "CN=Cha Ghor Dev, OU=Fallen_Beru, O=Cha Ghor, L=Sylhet, C=BD" \
  -ext "SAN=dns:localhost,ip:127.0.0.1,ip:$LAN_IP"

# ============================================================================
# THE FRONTEND NEEDS TLS TOO, OR NOTHING WORKS.
# ============================================================================
#
# config.js derives the API URL from the address the page was loaded at, so the
# page and the API always share a scheme. Enabling TLS on the backend ONLY would
# leave the app served over http while the API expects https -- the page would
# keep calling http://<ip>:8080 and get a connection reset, because nothing is
# listening in plain text any more.
#
# So both sides move together, with the same certificate. Vite wants PEM rather
# than PKCS12, so both formats are emitted here.
PEM_DIR="$(cd "$(dirname "$0")/.." && pwd)/frontend/certs"
if command -v openssl >/dev/null 2>&1; then
  mkdir -p "$PEM_DIR"
  openssl pkcs12 -in "$OUT" -passin "pass:$PASS" -nokeys  -out "$PEM_DIR/cert.pem" 2>/dev/null
  openssl pkcs12 -in "$OUT" -passin "pass:$PASS" -nocerts -nodes -out "$PEM_DIR/key.pem" 2>/dev/null
  chmod 600 "$PEM_DIR/key.pem"
  echo "Also written: $PEM_DIR/{cert,key}.pem  (vite.config.js picks these up)"
else
  echo "openssl not found -- skipped the PEM export."
  echo "The backend can still serve HTTPS; the Vite dev server cannot."
fi

echo
echo "Written: $OUT"
echo
echo "Start the backend with TLS:"
echo "  APP_SSL_ENABLED=true ./mvnw spring-boot:run"
echo
echo "Then open https://$LAN_IP:8080/actuator/health on each device ONCE and"
echo "accept the warning, so the sockets can connect afterwards."
echo
echo "The frontend follows automatically: config.js derives the API and"
echo "WebSocket URLs from the address the page was loaded at, so serving the"
echo "app over https makes it call https/wss without any edit."
