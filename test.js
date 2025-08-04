import fs from "fs";

async function testPrintPdf() {
    const url = "http://localhost:3000/print-pdf";

    const requestBody = {
        url: "https://www.baidu.com",
        storageState: {
            cookies: [],
            origins: [],
        },
    };

    try {
        console.log("Sending request to:", url);
        console.log("Request body:", JSON.stringify(requestBody, null, 2));

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
        });

        if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            console.log("✅ PDF generated successfully!");
            console.log("PDF size:", buffer.length, "bytes");
            console.log("Content-Type:", response.headers.get("content-type"));
            console.log("Content-Disposition:", response.headers.get("content-disposition"));

            // 可选：保存PDF文件到本地
            fs.writeFileSync("baidu.pdf", buffer);
            console.log("PDF saved as baidu.pdf");
        } else {
            const errorText = await response.text();
            console.error("❌ Request failed with status:", response.status);
            console.error("Error response:", errorText);
        }
    } catch (error) {
        console.error("❌ Error occurred:", error.message);
    }
}

// 运行测试
testPrintPdf();
