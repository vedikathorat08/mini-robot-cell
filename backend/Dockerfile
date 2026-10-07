FROM ros:lyrical-ros-base

RUN set -eux; \
    find /etc/apt -type f \( -name "*.list" -o -name "*.sources" \) \
        -exec sed -i 's|http://|https://|g' {} +; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates || true; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        ros-lyrical-rosbridge-suite \
        ros-lyrical-robot-state-publisher; \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY config/ /app/config/
COPY backend/ /app/backend/

COPY backend/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
