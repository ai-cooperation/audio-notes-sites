# 操作、更新與恢復

## 繼續未完成工作

保存站點URL、實際job ID、manifest、最後確認的片段與nextAttemptAt。換對話先取得合法存取，讀 workflow／preparation及D1工作狀態。uploading 補缺片後finalize；queued執行step；waiting_quota到期再試；failed查原因後retry；done讀文件，不重轉。

租約過期可恢復未確認片段；供應方已完成但結果未寫回時仍可能重送。只處理本人的指定工作，不批次重設其他使用者。

## 備份

需完整保存D1 schema與全部表、R2原key物件、另行保管加密主金鑰。只下載摘要不足以還原片段、歷史版本及Groq密文。現有UI提供逐文件Markdown及已保存原音下載，沒有一鍵完整備份工具。

Sites工具的邏輯DB／BUCKET不是外部Cloudflare資源ID；正式支援匯出方式未確認前，不能宣稱已有完整備份。

## 更新

維持原Site ID、owner、加密主金鑰。先保留目前來源版本與資料備份，審核新遷移並使用Sites發布。失敗回到已知版本前，確認新schema與舊碼相容；程式回滾不會自動還原資料庫。

## 還原與移除

還原到隔離私人測試Site，對比所有文件／物件與owner。新Site身分映射可能不同；改owner欄位不足以搬移綁定owner的密文。

完整刪除與資源歸零必須走Sites正式支援途徑；不可刪營運Site作測試。尚未完成backup/restore/teardown驗收，SmallGreen此gate保持未完成。

## 常見錯誤

401先確認正常登入或短效雙層授權，不偽造身份。Groq Key失效由本人後台重新設定。429保留佇列等恢復，不多開並行繞過額度。主金鑰遺失時明確說明Groq設定需重建，不盲目重置。
