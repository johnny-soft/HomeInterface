#!/bin/bash

cd /opt/homelab
pnpm install
pnpm build
sudo cp -r public .next/standalone/
sudo cp -r .next/static .next/standalone/.next/
sudo systemctl restart homelab
echo "Atualizado"
