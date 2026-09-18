# 同梱フォント

| ファイル | 内容 |
| --- | --- |
| `NotoSansJP-Regular.woff2` | Noto Sans JP / ウェイト 400 |
| `NotoSansJP-Bold.woff2` | Noto Sans JP / ウェイト 700 |
| `NotoSerifJP-Regular.woff2` | Noto Serif JP / ウェイト 400 |
| `NotoSerifJP-Bold.woff2` | Noto Serif JP / ウェイト 700 |
| `OFL.txt` | ライセンス本文（SIL Open Font License 1.1） |

同梱している理由は、どの PC でもスライドの見た目（文字幅・行の折り返し位置）を揃えるため。
OS 標準フォントに任せると、同じ `.pslide` が環境によって違う見た目になってしまう。

ライセンスは SIL Open Font License 1.1 で、アプリへの同梱・再配布が認められている。
`OFL.txt` は必ず一緒に配布すること。

## 可変フォントを使ってはいけない理由

Chromium の `printToPDF` は**可変フォントを PDF に埋め込まない**。フォント名の参照だけを
書き出し、しかも既定インスタンス（Noto Sans JP では Thin）の名前になる。その PDF を
フォントのない PC で開くと別の書体に置き換わってしまう。

ウェイトを固定した静的インスタンスであれば、サブセットが PDF に埋め込まれる。
そのため、ここには可変フォントではなく Regular / Bold の静的インスタンスを置いている。

## 作り直す手順

[Google Fonts](https://github.com/google/fonts) の可変フォントから静的インスタンスを作る。

```bash
pip install fonttools brotli
curl -sSLO 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf'
python3 make-static.py   # 下記の内容
```

`make-static.py`:

```python
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

for name, wght in {"Regular": 400, "Bold": 700}.items():
    font = TTFont("NotoSansJP[wght].ttf")
    instancer.instantiateVariableFont(font, {"wght": wght}, inplace=True, updateFontNames=True)
    font.flavor = "woff2"
    font.save(f"NotoSansJP-{name}.woff2")
```

Noto Serif JP も同じ手順（`ofl/notoserifjp/NotoSerifJP[wght].ttf`）。
