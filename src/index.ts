import express from "express";
import { chromium } from "playwright";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const app = express();
const port = process.env.PORT || 3000;

// Swagger/OpenAPI 3.1 配置
const swaggerOptions = {
    definition: {
        openapi: "3.1.0",
        info: {
            title: "Play PDF API",
            version: "1.0.0",
            description: "PDF generation service using Playwright",
        },
        servers: [
            {
                url: "http://localhost:3001",
                description: "Local server",
            },
            {
                url: "/",
                description: "Current server",
            },
        ],
    },
    apis: [__filename], // 只扫描本文件的JSDoc
};
const swaggerSpec = swaggerJsdoc(swaggerOptions);

// /doc.json 返回OpenAPI JSON
app.get("/doc.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
});

// /doc 返回Swagger UI页面
app.use("/doc", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
setTimeout(() => {
    console.log("Swagger UI available at http://localhost:3000/doc");
}, 0);
app.use(express.json({ limit: "2mb" }));

/**
 * @openapi
 * /api/print-pdf:
 *   post:
 *     summary: 生成PDF文件
 *     description: 根据传入的url和storageState生成PDF，支持截图模式和A4模式。
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *                 description: 需要生成PDF的页面URL
 *                 example: "https://example.com"
 *               storageState:
 *                 type: object
 *                 description: Playwright浏览器上下文的storageState对象
 *               useA4:
 *                 type: boolean
 *                 description: 是否使用A4纸张格式
 *                 default: false
 *               useScreenshot:
 *                 type: boolean
 *                 description: 是否使用截图模式
 *                 default: false
 *               cssSelector:
 *                 type: string
 *                 description: 可选，指定截图的CSS选择器
 *                 example: ""
 *               html:
 *                 type: string
 *                 description: 可选，直接渲染的HTML内容。如果提供此参数，将忽略url参数
 *                 example: "<html><body><h1>Hello World from HTML!</h1><p>This is a test PDF generated from HTML content.</p><img src='https://www.baidu.com/img/PCtm_d9c8750bed0b3c7d089fa7d55720d6cf.png' /></body></html>"
 *             required:
 *               - url
 *     responses:
 *       200:
 *         description: 返回生成的PDF文件
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: 请求参数缺失
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       500:
 *         description: 生成PDF失败
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
app.post("/api/print-pdf", async (req, res) => {
    let { url, storageState, useA4, useScreenshot, cssSelector, html } = req.body;
    // 如果传入cssSelector，则强制使用截图模式
    if (cssSelector) {
        useScreenshot = true;
    }

    // 参数验证：必须提供 url 或 html 其中之一
    if (!url && !html) {
        return res.status(400).json({ message: "Missing url or html parameter" });
    }

    // 如果提供了 url，进行 URL 格式验证
    if (url) {
        try {
            const parsedUrl = new URL(url);
            if (!(parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:")) {
                return res.status(400).json({ message: "Invalid url: only http(s) is allowed" });
            }
        } catch (e) {
            return res.status(400).json({ message: "Invalid url format" });
        }
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
        console.log(html ? "Generating PDF from HTML content" : `Generating PDF for URL: ${url}`);

        if (html) {
            // 如果提供了 HTML 内容，直接设置页面内容
            await page.setContent(html, { waitUntil: "domcontentloaded" });
        } else {
            // 否则访问 URL
            await page.goto(url, { waitUntil: "domcontentloaded" });
        }

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
        res.status(500).json({ message: `Failed to generate PDF: ${errorMessage}` });
    } finally {
        await browser.close();
    }
});

app.all("/", (req, res) => {
    res.send("Play PDF Server is running. Visit /doc for API documentation.");
});

app.listen(port, () => {
    console.log(`PDF server listening at http://localhost:${port}`);
});
