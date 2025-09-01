"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const playwright_1 = require("playwright");
const app = (0, express_1.default)();
const port = 3000;
app.use(express_1.default.json({ limit: "2mb" }));
app.post("/print-pdf", async (req, res) => {
    const { url, storageState } = req.body;
    if (!url || !storageState) {
        return res.status(400).json({ error: "Missing url or storageState" });
    }
    const browser = await playwright_1.chromium.launch();
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    try {
        await page.goto(url, { waitUntil: "networkidle" });
        await new Promise((r) => setTimeout(r, 5000)); // 等待额外的5秒，确保页面完全加载
        const pdfBuffer = await page.pdf({
            format: "A4",
            printBackground: true,
        });
        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="output.pdf"',
            "Content-Length": pdfBuffer.length,
        });
        res.send(pdfBuffer);
    }
    catch (err) {
        console.error("Failed to generate PDF:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: "Failed to generate PDF", detail: errorMessage });
    }
    finally {
        await browser.close();
    }
});
app.listen(port, () => {
    console.log(`PDF server listening at http://localhost:${port}`);
});
//# sourceMappingURL=index.js.map