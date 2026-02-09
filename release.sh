#!/bin/bash
#
# GonoPBX Release Script
# Erhöht die Patch-Version, aktualisiert die Dokumentation und erstellt Release Notes.
#
# Nutzung:
#   ./release.sh "Beschreibung der Änderungen"
#   ./release.sh "Rufumleitungen implementiert, DID-Anzeige im Dashboard"
#

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_JSON="$PROJECT_DIR/frontend/package.json"
DOKU_FILE="$PROJECT_DIR/DOKUMENTATION.md"
RELEASES_DIR="$PROJECT_DIR/releases"

# --- Argumente prüfen ---
if [ -z "$1" ]; then
    echo "Fehler: Bitte Release-Beschreibung angeben."
    echo "Nutzung: ./release.sh \"Beschreibung der Änderungen\""
    exit 1
fi

RELEASE_NOTES_TEXT="$1"

# --- Aktuelle Version lesen ---
CURRENT_VERSION=$(python3 -c "import json; print(json.load(open('$PACKAGE_JSON'))['version'])")
echo "Aktuelle Version: $CURRENT_VERSION"

# --- Patch-Version hochzählen ---
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
NEW_PATCH=$((PATCH + 1))
NEW_VERSION="$MAJOR.$MINOR.$NEW_PATCH"
echo "Neue Version:     $NEW_VERSION"

# --- package.json aktualisieren ---
python3 -c "
import json
with open('$PACKAGE_JSON', 'r') as f:
    data = json.load(f)
data['version'] = '$NEW_VERSION'
with open('$PACKAGE_JSON', 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
"
echo "package.json aktualisiert."

# --- Datum ---
TODAY=$(date +%d.%m.%Y)
TODAY_ISO=$(date +%Y-%m-%d)

# --- DOKUMENTATION.md Version und Stand aktualisieren ---
sed -i "s/^\\*\\*Version:\\*\\* .*/\\*\\*Version:\\*\\* $NEW_VERSION/" "$DOKU_FILE"
sed -i "s/^\\*\\*Stand:\\*\\* .*/\\*\\*Stand:\\*\\* $TODAY/" "$DOKU_FILE"

# --- Changelog-Eintrag in DOKUMENTATION.md einfügen ---
# Füge neuen Eintrag nach "## Changelog" ein
CHANGELOG_ENTRY="### v$NEW_VERSION ($TODAY)\n- $RELEASE_NOTES_TEXT\n"
sed -i "/^## Changelog$/a\\\\n$CHANGELOG_ENTRY" "$DOKU_FILE"

echo "DOKUMENTATION.md aktualisiert."

# --- Release Notes Datei erstellen ---
mkdir -p "$RELEASES_DIR"
RELEASE_FILE="$RELEASES_DIR/v${NEW_VERSION}.md"

cat > "$RELEASE_FILE" << EOF
# GonoPBX v${NEW_VERSION}

**Datum:** ${TODAY}
**Vorherige Version:** ${CURRENT_VERSION}

---

## Änderungen

${RELEASE_NOTES_TEXT}

---

## Deployment

\`\`\`bash
# Frontend neu bauen und deployen
docker compose build frontend && docker compose up -d frontend

# Backend neustarten (falls Backend-Änderungen)
docker restart pbx_backend
\`\`\`
EOF

echo "Release Notes erstellt: $RELEASE_FILE"

# --- Zusammenfassung ---
echo ""
echo "==================================="
echo " Release v$NEW_VERSION erstellt"
echo "==================================="
echo "  package.json:      $NEW_VERSION"
echo "  DOKUMENTATION.md:  aktualisiert"
echo "  Release Notes:     $RELEASE_FILE"
echo ""
echo "Nächste Schritte:"
echo "  docker compose build frontend && docker compose up -d frontend"
echo ""
