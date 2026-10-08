#!/bin/sh
set -eu
mkdir -p /tmp/pricehub-definitions
cat > /tmp/pricehub-definitions/00-usuarios.json <<JSON
{
  "vhosts": [{ "name": "/" }],
  "users": [{ "name": "${RABBITMQ_USER}", "password": "${RABBITMQ_PASSWORD}", "tags": ["administrator"] }],
  "permissions": [{ "user": "${RABBITMQ_USER}", "vhost": "/", "configure": ".*", "write": ".*", "read": ".*" }]
}
JSON
cp /etc/rabbitmq/definitions.json /tmp/pricehub-definitions/10-topologia.json
chmod -R a+r /tmp/pricehub-definitions
exec docker-entrypoint.sh rabbitmq-server
