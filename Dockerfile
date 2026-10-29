# Lokal-Intranet-Hub: Python-Server liefert die Seite (Ordner src/) aus und speichert Termine, Urlaube
# und Notizen in einer SQLite-Datenbank unter /data (bei Docker Compose ./daten, siehe docker-compose.yml).
# Neue Commits auf GitHub holt sich der Server alle 15 Minuten selbst (siehe server/server.py).
FROM python:3.13-alpine

WORKDIR /app
COPY server/server.py ./server.py
COPY src/ ./src/

# Commit, aus dem das Image gebaut wurde, und sein Zeitpunkt (setzt der GitHub-Workflow); Grundlage für die
# Update-Prüfung und die angezeigte Version
ARG APP_VERSION=""
ARG APP_DATUM=""
ENV PORT=80 \
    WEB_ORDNER=/app/src \
    DATENBANK=/data/intranet.db \
    APP_VERSION=$APP_VERSION \
    APP_DATUM=$APP_DATUM \
    UPDATE_REPO=eliasprey/Lokal-Intranet-Hub \
    UPDATE_MINUTEN=15
VOLUME /data
EXPOSE 80

HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1/api/daten > /dev/null || exit 1
CMD ["python3", "-u", "server.py"]
