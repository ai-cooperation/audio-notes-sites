# 第三方程式與授權

Audio Notes自有程式採MIT。此授權不取代第三方元件授權、平台條款或服務API政策。

- build/sites-vite-plugin.ts：來源@openai/sites-vite-plugin 0.2.0；原MIT聲明保存在build/sites-vite-plugin.LICENSE。
- vendor/shadcn-tailwind-4.13.0.css：保留vendor/shadcn-tailwind-4.13.0.LICENSE.md。
- Sites/Vinext起手式及UI元件保留現有檔案與引用。未重新將第三方程式聲明為作者獨有。
- pnpm-lock.yaml鎖定npm依賴。依賴授權盤點見release/dependency-licenses.json（由目前安裝套件metadata生成）。metadata不是完整授權審核，傳遞依賴及不明授權仍需維護者確認。
- Node、Python、FFmpeg是執行環境依賴，未把其binary一起散布。

GitHub、ChatGPT、Sites、Groq、Cloudflare等名稱只用於說明相容性，不代表背書。公開候選版不附任何使用者資料或免費API Key。
