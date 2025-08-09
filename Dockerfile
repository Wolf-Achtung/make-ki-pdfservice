#
# Dockerfile für den KI‑Readiness‑PDF‑Service
#
# Diese Variante verwendet das vorgefertigte Puppeteer‑Image mit
# vorinstalliertem Chrome. Dadurch entfallen langwierige apt‑get‑
# Installationen von Systembibliotheken und der Build bleibt schnell und
# stabil. Das Image `ghcr.io/puppeteer/puppeteer` wird vom Puppeteer‑Team
# gepflegt und enthält Node.js sowie alle benötigten Chromium‑Runtime‑
# Bibliotheken. Der Dienst bleibt unverändert – er startet einen
# Headless‑Browser, rendert das übermittelte HTML und gibt das PDF
# zurück. Optional kann eine E‑Mail mit dem PDF an einen Administrator
# gesendet werden.

FROM ghcr.io/puppeteer/puppeteer:latest

# Arbeitsverzeichnis festlegen
WORKDIR /usr/src/app

# package.json und package-lock.json kopieren und Abhängigkeiten
# installieren. Wir verzichten bewusst auf dev‑Dependencies, um das
# Image kompakt zu halten.
COPY package*.json ./
RUN npm install --omit=dev

# Quellcode kopieren
COPY . .

# Port für den Express‑Server freigeben
EXPOSE 8080

# Startkommando für den PDF‑Service
CMD ["node", "index.js"]