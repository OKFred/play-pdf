import fs from "fs";
import path from "path";
import { spawn, ChildProcess } from "child_process";
import treeKill from "tree-kill";
let serverProcess: ChildProcess | undefined;

beforeAll((done) => {
    serverProcess = spawn("pnpm", ["run", "dev"], {
        cwd: path.resolve(__dirname, ".."),
        shell: true,
        stdio: "inherit",
    });
    // 等待服务启动，建议实际项目用更健壮的端口探测
    setTimeout(done, 3000);
}, 20000);

afterAll(() => {
    if (serverProcess && serverProcess.pid) {
        treeKill(serverProcess.pid, 'SIGKILL');
    }
});

describe("POST /print-pdf", () => {
    it("should return a PDF file", async () => {
        const url = "http://localhost:3000/print-pdf";
        const data = {
            url: "https://163.com", // 可替换为实际可访问的页面
            storageState: {}, // 可根据实际情况填写
        };
        const outputPath = path.join(__dirname, "output.pdf");
        let response;
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 60000);
            response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
                signal: controller.signal,
            });
            clearTimeout(timeout);
        } catch (err) {
            if (err && typeof err === "object" && "message" in err) {
                throw new Error("请求超时或失败: " + (err as any).message);
            } else {
                throw new Error("请求超时或失败: " + String(err));
            }
        }
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/pdf");
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(outputPath, buffer);
        const stats = fs.statSync(outputPath);
        expect(stats.size).toBeGreaterThan(0);
    }, 60000);
});
