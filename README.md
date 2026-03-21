# countdown-hub（倒數計時器）

個人專案：React + Vite 製作的多標籤倒數計時器網頁。

## 本機開發

```bash
npm install
npm run dev
```

瀏覽器開啟終端機顯示的網址（通常為 `http://localhost:5173`）。

## 建置

```bash
npm run build
```

產出目錄為 `dist/`。

---

## GitHub 備份（免費）

### 第一次：在電腦上已提交、尚未推上 GitHub

1. 到 [GitHub](https://github.com) 登入 → **New repository**。
2. **Repository name** 填例如 `countdown-hub`。
3. 選 **Public**（免費）。
4. **不要**勾選「Add a README」等（保持空儲存庫）。
5. 建立後，照頁面上的指令執行（若你已在本機 `git commit` 過，通常只需要 **remote** 與 **push**）：

```bash
cd /你的專案路徑/countdown-hub
git branch -M main
git remote add origin https://github.com/你的帳號/countdown-hub.git
git push -u origin main
```

若 GitHub 要你登入：建議用 **HTTPS + Personal Access Token**（或改用 GitHub Desktop）。

### 之後每次備份

```bash
git add .
git commit -m "說明你改了什麼"
git push
```

---

## 免費上線（Vercel，建議）

1. 到 [vercel.com](https://vercel.com) 用 GitHub 帳號登入（免費）。
2. **Add New Project** → **Import** 你的 `countdown-hub` 儲存庫。
3. **Framework Preset** 選 **Vite**（或保持自動偵測）。
4. **Build Command**：`npm run build`  
   **Output Directory**：`dist`
5. 按 **Deploy**。完成後會得到 `https://你的專案名.vercel.app` 這類網址。

之後每次 `git push` 到 `main`，Vercel 會自動重新部署。

### 免費上線（Netlify 替代）

1. [netlify.com](https://www.netlify.com) 用 GitHub 登入。
2. **Add new site** → **Import an existing project** → 選儲存庫。
3. Build：`npm run build`，Publish directory：`dist`。

---

## 授權

個人專案；若未來要開源請自行補上 LICENSE。
