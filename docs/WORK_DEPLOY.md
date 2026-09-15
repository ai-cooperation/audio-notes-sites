# Work 部署與設定

## 資源範圍

唯一託管方式是 Sites；Worker、D1、R2 由 Sites 管理，Groq 只做語音轉文字。Work 負責附件解碼切片、校正及摘要。不得新增外部 Cloudflare、GitHub Actions 排程、其他主機或摘要模型 API。

公開快照與每人的私人部署分開。不要複製營運 Git 歷史、資料庫、詞庫、帳戶識別碼或 Key。

## 建站

1. 核對來源、版本與 LICENSE；現有 checkout 有 project_id 時重用正確 Site。新快照 manifest 只有 `{"d1":"DB","r2":"BUCKET"}`。
2. 依目前 Sites skills 設 execution profile，以其 install-dependencies helper 與鎖檔安裝；helper會選專案所需pnpm 11.25.0，不能只憑PATH上的其他版本宣稱一致。由原生工具建立私人 Site、寫入真實 ID；不猜 hosting capability。
3. 套用全部遷移0000至0004，順序以 drizzle/meta/_journal.json 為準；後續版本讀當前 journal。
4. 首次產生32-byte隨機主金鑰，base64 後存 CREDENTIAL_ENCRYPTION_KEY Secret。只在受控程序與 Sites Secret 傳遞，不顯示聊天或日誌。更新時保留原主金鑰。
5. 依 Sites 的來源保存、建置、版本與私人發布流程，等終態成功才交付網站 URL。

## Groq Key 後台

使用者自行到 [Groq Keys](https://console.groq.com/keys) 建立 Key，使用免費方案。登入自己的網站，在「語音辨識設定」密碼欄貼上，按「驗證並儲存」。

伺服器驗證 whisper-large-v3 模型存取後，以 AES-GCM 加密寫入 D1；加密 additionalData 綁定 owner。網頁只讀到設定狀態／更新時間，不提供明文、不寫 localStorage 或 sessionStorage。失敗不覆蓋原有效設定。

應用不會主動升級或購買，但不能從 Key 保證帳戶方案。本人若自行改用付費帳戶，供應方可能計費，以後台為準。

## 環境設定

| 名稱 | 用途 | 預設 |
|---|---|---|
| DB | Sites D1 binding | manifest 宣告 |
| BUCKET | Sites R2 binding | manifest 宣告 |
| CREDENTIAL_ENCRYPTION_KEY | base64 32-byte 加密主密鑰 | 必要 Secret |
| AUDIO_SERVICE_TOKEN | 限時、owner-scoped 匯入憑證 | 不設定 |
| AUDIO_SERVICE_OWNER | Sites 實際驗證 owner ID | 不設定、不猜測 |
| AUDIO_SERVICE_EXPIRES | Unix epoch 毫秒 | 不設定 |

不設定外部 Cloudflare API token、AI binding 或 OpenAI API Key。

## Work 傳檔授權：與網頁登入分開

私人網站可開啟，不等於 Work 執行端已授權。現有維護匯入路徑需要 Sites 入口驗證加上限時服務憑證，預設停用；不是已完成的遠端 OAuth。

客戶端程序環境需 AUDIO_SITE_URL、AUDIO_SITE_TOKEN、AUDIO_SERVICE_TOKEN；入口 token 必須由 Sites 正式工具提供，不能捏造身份標頭或索取使用者在聊天貼 token。已授權匯入時，由站點擁有者設定短效、綁定既有 owner 的存取；完成後移除並部署生效。

若當前 Work 缺少合法授權與二進位上傳，完成可做的網站設定並回報附件階段未完成，不公開站點繞過驗證，不把 /mcp 當即用服務。

## 首次驗收

分別記錄：私人網站部署；Groq 後台驗證；Work 合法傳檔；真實 Groq 轉錄；D1 四份文件讀回；completion verified 與私人連結。

使用合成或明確授權的短音檔，不提交私人會議作公用範例。目前沒有全新帳戶完成上述所有階段的公開證據。
