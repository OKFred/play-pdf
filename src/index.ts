import express from "express";
import { chromium } from "playwright";

const app = express();
const port = 3000;

app.use(express.json({ limit: "2mb" }));


app.post("/print-pdf", async (req, res) => {
    let { url, storageState, useA4, useScreenshot, cssSelector } = req.body;
    // 如果传入cssSelector，则强制使用截图模式
    if (cssSelector) {
        useScreenshot = true;
    }


    if (!url || !storageState) {
        return res.status(400).json({ error: "Missing url or storageState" });
    }

    const browser = await chromium.launch({
        args: [
            "--window-size=1920,1080", // 设置初始窗口大小
            "--disable-blink-features=AutomationControlled", // anti-antibot
        ],
    });
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1920, height: 1080 });

    try {
        console.log("Generating PDF for URL:", url);
        await page.goto(url, { waitUntil: "networkidle" });
        await new Promise((r) => setTimeout(r, 5000)); // 等待额外的5秒，确保页面完全加载

        let pdfBuffer: Buffer;
        if (useScreenshot) {
            let screenshotBuffer: Buffer;
            if (cssSelector) {
                // 只截取第一个匹配的元素
                const elementHandle = await page.$(cssSelector);
                if (!elementHandle) {
                    throw new Error(`Selector '${cssSelector}' not found on page`);
                }
                screenshotBuffer = await elementHandle.screenshot();
                await elementHandle.dispose();
            } else {
                // 全页截图
                screenshotBuffer = await page.screenshot({ fullPage: true });
            }
            const base64Img = screenshotBuffer.toString("base64");
            const dataUrl = `data:image/png;base64,${base64Img}`;

            // 2. 新建页面，插入图片
            const imgPage = await context.newPage();
            const html = `<html><body style=\"margin:0;padding:0;\"><img id='simg' src='${dataUrl}' style='width:100%;height:auto;display:block;'/></body></html>`;
            await imgPage.setContent(html, { waitUntil: "load" });

            // 3. 获取图片原始尺寸（通过页面js）
            const { imgWidth, imgHeight } = await imgPage.evaluate(() => {
                return new Promise<{ imgWidth: number; imgHeight: number }>((resolve) => {
                    const img = document.getElementById("simg") as HTMLImageElement;
                    if (img && img.complete) {
                        resolve({ imgWidth: img.naturalWidth, imgHeight: img.naturalHeight });
                    } else if (img) {
                        img.onload = () => {
                            resolve({ imgWidth: img.naturalWidth, imgHeight: img.naturalHeight });
                        };
                    } else {
                        resolve({ imgWidth: 1920, imgHeight: 1080 });
                    }
                });
            });

            // 4. 设置PDF参数
            let pdfConfigObj = {
                printBackground: true,
                displayHeaderFooter: false,
            } as Parameters<typeof page.pdf>[0];
            if (useA4) {
                pdfConfigObj = { ...pdfConfigObj, format: "A4" };
            } else {
                // 用图片原始尺寸
                pdfConfigObj = {
                    ...pdfConfigObj,
                    width: `${imgWidth}px`,
                    height: `${imgHeight}px`,
                };
            }
            pdfBuffer = await imgPage.pdf(pdfConfigObj);
            await imgPage.close();
        } else {
            let pdfConfigObj = {
                printBackground: true,
                displayHeaderFooter: true,
            } as Parameters<typeof page.pdf>[0];
            if (useA4) {
                pdfConfigObj = { ...pdfConfigObj, format: "A4" };
            } else {
                pdfConfigObj = { ...pdfConfigObj, width: "1920px" };
            }
            pdfBuffer = await page.pdf(pdfConfigObj);
        }

        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="output.pdf"',
            "Content-Length": pdfBuffer.length,
        });
        res.send(pdfBuffer);
    } catch (err) {
        console.error("Failed to generate PDF:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: "Failed to generate PDF", detail: errorMessage });
    } finally {
        await browser.close();
    }
});

app.listen(port, () => {
    console.log(`PDF server listening at http://localhost:${port}`);
});
