import express from "express";
import { chromium } from "playwright";
const app = express();
const port = 3000;
app.use(express.json({ limit: "2mb" }));
app.post("/print-pdf", async (req, res) => {
    const { url, storageState } = req.body;
    if (!url || !storageState) {
        return res.status(400).json({ error: "Missing url or storageState" });
    }
    const browser = await chromium.launch();
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    try {
        await page.goto(url, { waitUntil: "networkidle" });
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
        res.status(500).json({ error: "Failed to generate PDF", detail: err.message });
    }
    finally {
        await browser.close();
    }
});
app.listen(port, () => {
    console.log(`PDF server listening at http://localhost:${port}`);
});
//# sourceMappingURL=index.js.map