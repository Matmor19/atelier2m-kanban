#!/bin/sh
# Fabrique le fichier d'installation SketchUp (.rbz) de A2M Construction.
# Usage : sh outils/sketchup/fabriquer_rbz.sh
set -e
ICI=$(cd "$(dirname "$0")" && pwd)
VERSION=$(sed -n "s/.*VERSION = '\(.*\)'.*/\1/p" "$ICI/plugin/a2m_construction/main.rb")
mkdir -p "$ICI/dist"
SORTIE="$ICI/dist/A2M_Construction-$VERSION.rbz"
rm -f "$SORTIE"
cd "$ICI/plugin"
zip -q -r -X "$SORTIE" a2m_construction.rb a2m_construction
echo "Créé : $SORTIE"
