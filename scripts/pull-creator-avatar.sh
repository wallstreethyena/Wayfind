#!/bin/zsh
# Real Instagram profile photo at FULL resolution, then centre-crop square and
# resize to 240x240 JPEG to match the committed set.
#
# The og:image a crawler UA gets is only 100x100 (the URL literally carries
# dst-jpg_s100x100). web_profile_info returns profile_pic_url_hd, which is the
# 320px+ original — no login, no scraping of a walled page.
APPID='936619743392459'
BROWSER='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
DEST=/Users/gabrielpereira/Projects/wf-creators-b7/public/creators
TMP=/Users/gabrielpereira/Projects/wf-harvest/av
mkdir -p "$TMP"
for H in "$@"; do
  URL=$(curl -s --max-time 25 -H "x-ig-app-id: $APPID" -A "$BROWSER" \
    "https://www.instagram.com/api/v1/users/web_profile_info/?username=$H" \
    | python3 -c 'import sys,json;d=json.load(sys.stdin);u=d["data"]["user"];print(u.get("profile_pic_url_hd") or u.get("profile_pic_url") or "")')
  if [ -z "$URL" ]; then echo "$H: NO profile_pic_url_hd"; continue; fi
  curl -sL --max-time 30 -A "$BROWSER" -o "$TMP/$H.hd" "$URL"
  TYPE=$(file -b --mime-type "$TMP/$H.hd")
  DIM=$(sips -g pixelWidth -g pixelHeight "$TMP/$H.hd" 2>/dev/null | tail -2 | tr -d ' \n')
  echo "$H: $TYPE $(stat -f%z "$TMP/$H.hd") bytes  SOURCE $DIM"
  case "$TYPE" in image/*)
    sips -s format jpeg "$TMP/$H.hd" --out "$TMP/$H.jpg" >/dev/null 2>&1
    W=$(sips -g pixelWidth "$TMP/$H.jpg" | tail -1 | awk '{print $2}')
    Ht=$(sips -g pixelHeight "$TMP/$H.jpg" | tail -1 | awk '{print $2}')
    S=$([ "$W" -lt "$Ht" ] && echo "$W" || echo "$Ht")
    sips -c "$S" "$S" "$TMP/$H.jpg" >/dev/null 2>&1
    sips -z 240 240 "$TMP/$H.jpg" >/dev/null 2>&1
    cp "$TMP/$H.jpg" "$DEST/$H.jpg"
    echo "   -> committed $(stat -f%z "$DEST/$H.jpg") bytes $(sips -g pixelWidth -g pixelHeight "$DEST/$H.jpg" | tail -2 | tr -d ' \n')"
  ;; *) echo "   NOT AN IMAGE, skipped";; esac
done
