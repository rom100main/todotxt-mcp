import * as fs from "fs";
import * as path from "path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { TodoTxt } from "txtodo";
import * as z from "zod";

export const server = new McpServer({
    name: "todotxt-mcp",
    version: "0.1.0",
});

function getTodoTxtPath(): string {
    return path.join(process.cwd(), "todo.txt");
}

async function getTodoInstance(requireFile = false): Promise<TodoTxt> {
    const todoPath = getTodoTxtPath();

    if (requireFile && !fs.existsSync(todoPath)) {
        fs.writeFileSync(todoPath, "", "utf8");
    }

    const todo = new TodoTxt({ filePath: todoPath, autoSave: true });

    if (fs.existsSync(todoPath)) {
        try {
            await todo.load();
        } catch {
            // File exists but might be empty or unreadable
        }
    }

    return todo;
}

server.registerTool(
    "list-tasks",
    {
        title: "List Tasks",
        description: "List all tasks from todo.txt file",
    },
    async () => {
        try {
            const todo = await getTodoInstance();
            const tasks = todo.list();

            const formattedTasks = tasks.map((task, index) => {
                const completed = task.completed ? "[x]" : "[ ]";
                return `${index}. ${completed} ${task.description}`;
            });

            return {
                content: [
                    {
                        type: "text",
                        text:
                            formattedTasks.length === 0
                                ? "No tasks found"
                                : `Tasks (${formattedTasks.length}):\n${formattedTasks.join("\n")}`,
                    },
                ],
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error listing tasks: ${errorMessage}`,
                    },
                ],
                isError: true,
            };
        }
    },
);

server.registerTool(
    "add-tasks",
    {
        title: "Add Tasks",
        description: "Add one or multiple tasks to todo.txt",
        inputSchema: {
            tasks: z.array(z.string()).describe("Array of task descriptions to add"),
        },
    },
    async ({ tasks }) => {
        try {
            const todo = await getTodoInstance(true);

            await todo.add(tasks);

            return {
                content: [
                    {
                        type: "text",
                        text: `Successfully added ${tasks.length} task(s)`,
                    },
                ],
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error adding tasks: ${errorMessage}`,
                    },
                ],
                isError: true,
            };
        }
    },
);

server.registerTool(
    "complete-tasks",
    {
        title: "Complete Tasks",
        description: "Mark tasks as complete by their 0-indexed position",
        inputSchema: {
            numbers: z.array(z.number()).describe("Array of 0-indexed task numbers to mark as complete"),
        },
    },
    async ({ numbers }) => {
        try {
            const todo = await getTodoInstance();

            await todo.mark(numbers);

            return {
                content: [
                    {
                        type: "text",
                        text: `Successfully marked ${numbers.length} task(s) as complete`,
                    },
                ],
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error completing tasks: ${errorMessage}`,
                    },
                ],
                isError: true,
            };
        }
    },
);

server.registerTool(
    "remove-tasks",
    {
        title: "Remove Tasks",
        description: "Remove tasks by their 0-indexed position or remove all tasks",
        inputSchema: {
            numbers: z.array(z.number()).optional().describe("Array of 0-indexed task numbers to remove"),
            all: z.boolean().optional().default(false).describe("If true, remove all tasks"),
        },
    },
    async ({ numbers, all }) => {
        try {
            const todo = await getTodoInstance();

            if (all) {
                const tasks = todo.list();
                const indices = tasks.map((_, index) => index);
                await todo.remove(indices);

                return {
                    content: [
                        {
                            type: "text",
                            text: `Successfully removed all ${tasks.length} tasks`,
                        },
                    ],
                };
            } else {
                if (!numbers || numbers.length === 0) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: "No task numbers specified",
                            },
                        ],
                        isError: true,
                    };
                }

                await todo.remove(numbers);

                return {
                    content: [
                        {
                            type: "text",
                            text: `Successfully removed ${numbers.length} task(s)`,
                        },
                    ],
                };
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error removing tasks: ${errorMessage}`,
                    },
                ],
                isError: true,
            };
        }
    },
);

server.registerTool(
    "update-task",
    {
        title: "Update Task",
        description: "Update a task by its 0-indexed position",
        inputSchema: {
            number: z.number().describe("0-indexed task number to update"),
            description: z.string().describe("New task description"),
        },
    },
    async ({ number, description }) => {
        try {
            const todo = await getTodoInstance();

            await todo.update(number, { description });

            return {
                content: [
                    {
                        type: "text",
                        text: `Successfully updated task ${number}`,
                    },
                ],
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error updating task: ${errorMessage}`,
                    },
                ],
                isError: true,
            };
        }
    },
);

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("todotxt-mcp server running on stdio");
}

main().catch(console.error);
