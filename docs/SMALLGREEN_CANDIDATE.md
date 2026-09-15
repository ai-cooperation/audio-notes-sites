# SmallGreen 候選：Audio Notes

狀態：Candidate；原碼已公開，候選已提交 [PR #9](https://github.com/smallgreen-cloud/registry/pull/9)。正式部署驗收與 SmallGreen 發布仍待完成。此頁不是服務卡或Ready徽章。

## 公開介紹

**自己的會議自己記！** 用自己的ChatGPT Work整理錄音、校正專業詞彙，留下逐字稿、摘要與待辦。私人資料保存在自己的Sites；語音轉錄使用自己的Groq免費額度。

適用：帳戶實際具備Work／Sites、願意首次在後台設定Groq Key的使用者。SB是選用知識來源；待辦、行事曆與Gmail是可交接的後續工作。

## English listing copy

**Your meetings, your notes.** Use your own ChatGPT Work to turn recordings into transcripts, contextual terminology corrections, meeting summaries and follow-up tasks. Store your data in your private Sites deployment and use your own Groq account for speech recognition.

Requires actual Work/Sites access and initial Groq key setup. Audio is sent to Groq. No verified remote OAuth MCP connection, unattended next-day processing, or zero-configuration deployment is promised.

## 提交位置與資格

- 原碼已公開於 [ai-cooperation/audio-notes-sites](https://github.com/ai-cooperation/audio-notes-sites)，候選快照鎖定 `d25f8a5998418f28cc9d8ade99fe89eb12ee179a`；全新Git歷史，不公開既有私人營運庫。
- 候選介紹提交 `smallgreen-cloud/registry/candidates/audio-notes-sites.md`。
- 正式網站由 `smallgreen-cloud/site` 的既有生成流程發布，不另建手工頁。
- Sites是平台代管資源，Work是互動執行端，Groq是外部服務。不能直接偽稱已符合目前需要wrangler契約的Small App/Pipeline Profile；需維護者接受對應profile與證據方式。

遵循 [發布標準](https://github.com/smallgreen-cloud/registry/blob/main/PROJECT_PUBLISHING_STANDARD.md)：公開授權來源與鎖定版本→adapter契約→conformance→真實部署/驗收/獨立複驗/teardown→append-only evidence→generator→registry gate→雙語網站→人工review。任何門檻未過，維持候選。

待補：新帳戶傳檔授權、真實E2E、正式資源基線與刪除驗證、相容profile、第三方依賴完整檢視。現行截圖只為未登入預覽，不能充當真實部署Evidence Pack。
