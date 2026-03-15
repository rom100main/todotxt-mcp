import { spawn, ChildProcess } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { TodoTxt } from "txtodo";

describe("TodoTxt MCP Server Tools", () => {
    let testDir: string;
    let todoPath: string;
    let serverProcess: ChildProcess | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let stdin: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let stdout: any;
    let messageId = 0;

    beforeEach(async () => {
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), "todotxt-mcp-test-"));
        todoPath = path.join(testDir, "todo.txt");
        process.chdir(testDir);
        messageId = 0;

        const serverPath = path.join(__dirname, "..", "dist", "index.js");

        await new Promise<void>((resolve, reject) => {
            serverProcess = spawn("node", [serverPath], {
                cwd: testDir,
                stdio: ["pipe", "pipe", "pipe"],
                env: { ...process.env },
            });

            stdin = serverProcess.stdin;
            stdout = serverProcess.stdout;

            let outputBuffer = "";

            const checkReady = () => {
                if (outputBuffer.includes("running on stdio")) {
                    resolve();
                }
            };

            serverProcess.stderr?.on("data", (data) => {
                outputBuffer += data.toString();
                checkReady();
            });

            serverProcess.stdout?.on("data", (data) => {
                outputBuffer += data.toString();
                checkReady();
            });

            serverProcess.on("error", (err) => {
                reject(new Error(`Server process error: ${err.message}`));
            });

            setTimeout(() => {
                reject(new Error(`Server startup timeout. Output: ${outputBuffer}`));
            }, 10000);
        });
    });

    afterEach(async () => {
        if (serverProcess) {
            serverProcess.kill("SIGTERM");
            serverProcess = null;
        }
        process.chdir(process.cwd());
        fs.rmSync(testDir, { recursive: true, force: true });
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function sendMcpMessage(method: string, params: any = {}): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = ++messageId;
            const message = {
                jsonrpc: "2.0",
                id,
                method,
                params,
            };

            const timeout = setTimeout(() => {
                reject(new Error(`Message timeout for method: ${method}`));
            }, 5000);

            const dataHandler = (data: Buffer) => {
                const lines = data
                    .toString()
                    .split("\n")
                    .filter((line) => line.trim());
                for (const line of lines) {
                    try {
                        const response = JSON.parse(line);
                        if (response.id === id) {
                            stdout.removeListener("data", dataHandler);
                            clearTimeout(timeout);
                            resolve(response);
                        }
                    } catch {
                        // Ignore non-JSON lines
                    }
                }
            };

            stdout.on("data", dataHandler);
            stdin.write(JSON.stringify(message) + "\n");
        });
    }

    async function initializeClient() {
        await sendMcpMessage("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test-client", version: "1.0.0" },
        });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function callTool(name: string, arguments_: any = {}) {
        return sendMcpMessage("tools/call", {
            name,
            arguments: arguments_,
        });
    }

    describe("list-tasks", () => {
        it("should return empty list when no tasks exist", async () => {
            await initializeClient();
            const result = await callTool("list-tasks", {});

            expect(result.result.content).toHaveLength(1);
            expect(result.result.content[0].text).toBe("No tasks found");
        });

        it("should list all tasks", async () => {
            const todo = new TodoTxt({ filePath: todoPath });
            await todo.add(["Task 1", "Task 2", "Task 3"]);
            await todo.save();

            await initializeClient();
            const result = await callTool("list-tasks", {});

            expect(result.result.content).toHaveLength(1);
            const text = result.result.content[0].text as string;
            expect(text).toContain("Tasks (3):");
            expect(text).toContain("0.");
            expect(text).toContain("1.");
            expect(text).toContain("2.");
        });
    });

    describe("add-tasks", () => {
        it("should add a single task", async () => {
            await initializeClient();
            const result = await callTool("add-tasks", {
                tasks: ["My first task"],
            });

            expect(result.result.content).toHaveLength(1);
            expect(result.result.content[0].text).toBe("Successfully added 1 task(s)");

            const todo = new TodoTxt({ filePath: todoPath });
            await todo.load();
            const tasks = todo.list();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].description).toBe("My first task");
        });

        it("should add multiple tasks", async () => {
            await initializeClient();
            const result = await callTool("add-tasks", {
                tasks: ["Task 1", "Task 2", "Task 3"],
            });

            expect(result.result.content).toHaveLength(1);
            expect(result.result.content[0].text).toBe("Successfully added 3 task(s)");

            const todo = new TodoTxt({ filePath: todoPath });
            await todo.load();
            const tasks = todo.list();
            expect(tasks).toHaveLength(3);
        });

        it("should create todo.txt file if it doesn't exist", async () => {
            expect(fs.existsSync(todoPath)).toBe(false);

            await initializeClient();
            await callTool("add-tasks", {
                tasks: ["New task"],
            });

            expect(fs.existsSync(todoPath)).toBe(true);
        });
    });

    describe("complete-tasks", () => {
        it("should mark a task as complete", async () => {
            const todo = new TodoTxt({ filePath: todoPath });
            await todo.add(["Task to complete"]);
            await todo.save();

            await initializeClient();
            const result = await callTool("complete-tasks", {
                numbers: [0],
            });

            expect(result.result.content).toHaveLength(1);
            expect(result.result.content[0].text).toBe("Successfully marked 1 task(s) as complete");

            await todo.load();
            const tasks = todo.list();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].completed).toBe(true);
        });

        it("should mark multiple tasks as complete", async () => {
            const todo = new TodoTxt({ filePath: todoPath });
            await todo.add(["Task 1", "Task 2", "Task 3"]);
            await todo.save();

            await initializeClient();
            const result = await callTool("complete-tasks", {
                numbers: [0, 2],
            });

            expect(result.result.content).toHaveLength(1);
            expect(result.result.content[0].text).toBe("Successfully marked 2 task(s) as complete");

            await todo.load();
            const tasks = todo.list();
            expect(tasks[0].completed).toBe(true);
            expect(tasks[1].completed).toBe(false);
            expect(tasks[2].completed).toBe(true);
        });

        it("should return error for invalid task number", async () => {
            const todo = new TodoTxt({ filePath: todoPath });
            await todo.add(["Task 1"]);
            await todo.save();

            await initializeClient();
            const result = await callTool("complete-tasks", {
                numbers: [99],
            });

            expect(result.result.isError).toBe(true);
            expect(result.result.content[0].text).toContain("Invalid task number");
            expect(result.result.content[0].text).toContain("Index out of bounds");
        });
    });

    describe("remove-tasks", () => {
        it("should remove a single task", async () => {
            const todo = new TodoTxt({ filePath: todoPath });
            await todo.add(["Task to remove", "Task to keep"]);
            await todo.save();

            await initializeClient();
            const result = await callTool("remove-tasks", {
                numbers: [0],
            });

            expect(result.result.content).toHaveLength(1);
            expect(result.result.content[0].text).toBe("Successfully removed 1 task(s)");

            await todo.load();
            const tasks = todo.list();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].description).toBe("Task to keep");
        });

        it("should remove multiple tasks", async () => {
            const todo = new TodoTxt({ filePath: todoPath });
            await todo.add(["Task 1", "Task 2", "Task 3", "Task 4"]);
            await todo.save();

            await initializeClient();
            const result = await callTool("remove-tasks", {
                numbers: [0, 2],
            });

            expect(result.result.content).toHaveLength(1);
            expect(result.result.content[0].text).toBe("Successfully removed 2 task(s)");

            await todo.load();
            const tasks = todo.list();
            expect(tasks).toHaveLength(2);
            expect(tasks[0].description).toBe("Task 2");
            expect(tasks[1].description).toBe("Task 4");
        });

        it("should remove all tasks when all flag is true", async () => {
            const todo = new TodoTxt({ filePath: todoPath });
            await todo.add(["Task 1", "Task 2", "Task 3"]);
            await todo.save();

            await initializeClient();
            const result = await callTool("remove-tasks", {
                all: true,
            });

            expect(result.result.content).toHaveLength(1);
            expect(result.result.content[0].text).toBe("Successfully removed all 3 tasks");

            await todo.load();
            const tasks = todo.list();
            expect(tasks).toHaveLength(0);
        });

        it("should handle removing all tasks when no tasks exist", async () => {
            await initializeClient();
            const result = await callTool("remove-tasks", {
                all: true,
            });

            expect(result.result.content).toHaveLength(1);
            expect(result.result.content[0].text).toContain("removed all");
        });

        it("should return error when no numbers provided and all is false", async () => {
            await initializeClient();
            const result = await callTool("remove-tasks", {
                numbers: [],
                all: false,
            });

            expect(result.result.isError).toBe(true);
            expect(result.result.content[0].text as string).toContain("No task numbers specified");
        });
    });

    describe("update-task", () => {
        it("should update task description", async () => {
            const todo = new TodoTxt({ filePath: todoPath });
            await todo.add(["Original description"]);
            await todo.save();

            await initializeClient();
            const result = await callTool("update-task", {
                number: 0,
                description: "Updated description",
            });

            expect(result.result.content).toHaveLength(1);
            expect(result.result.content[0].text).toBe("Successfully updated task 0");

            await todo.load();
            const tasks = todo.list();
            expect(tasks).toHaveLength(1);
            expect(tasks[0].description).toBe("Updated description");
        });

        it("should return error for invalid task number", async () => {
            const todo = new TodoTxt({ filePath: todoPath });
            await todo.add(["Task 1"]);
            await todo.save();

            await initializeClient();
            const result = await callTool("update-task", {
                number: 99,
                description: "New description",
            });

            expect(result.result.isError).toBe(true);
            expect(result.result.content[0].text as string).toContain("Invalid task number");
            expect(result.result.content[0].text as string).toContain("Index out of bounds");
        });

        it("should handle negative task numbers", async () => {
            const todo = new TodoTxt({ filePath: todoPath });
            await todo.add(["Task 1", "Task 2", "Task 3"]);
            await todo.save();

            await initializeClient();
            const result = await callTool("update-task", {
                number: -1,
                description: "Last task updated",
            });

            expect(result.result.isError).toBe(undefined);
            expect(result.result.content[0].text).toBe("Successfully updated task -1");

            await todo.load();
            const tasks = todo.list();
            expect(tasks[tasks.length - 1].description).toBe("Last task updated");
        });
    });
});
