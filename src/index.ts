#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { TodoistApi } from "@doist/todoist-api-typescript";
import express, { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

// Define tools
const CREATE_TASK_TOOL: Tool = {
  name: "todoist_create_task",
  description: "Create a new task in Todoist with optional description, due date, and priority",
  inputSchema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "The content/title of the task"
      },
      description: {
        type: "string",
        description: "Detailed description of the task (optional)"
      },
      due_string: {
        type: "string",
        description: "Natural language due date like 'tomorrow', 'next Monday', 'Jan 23' (optional)"
      },
      priority: {
        type: "number",
        description: "Task priority from 1 (normal) to 4 (urgent) (optional)",
        enum: [1, 2, 3, 4]
      }
    },
    required: ["content"]
  }
};

const GET_TASKS_TOOL: Tool = {
  name: "todoist_get_tasks",
  description: "Get a list of tasks from Todoist with various filters",
  inputSchema: {
    type: "object",
    properties: {
      project_id: {
        type: "string",
        description: "Filter tasks by project ID (optional)"
      },
      filter: {
        type: "string",
        description: "Natural language filter like 'today', 'tomorrow', 'next week', 'priority 1', 'overdue' (optional)"
      },
      priority: {
        type: "number",
        description: "Filter by priority level (1-4) (optional)",
        enum: [1, 2, 3, 4]
      },
      limit: {
        type: "number",
        description: "Maximum number of tasks to return (optional)",
        default: 10
      }
    }
  }
};

const UPDATE_TASK_TOOL: Tool = {
  name: "todoist_update_task",
  description: "Update an existing task in Todoist by searching for it by name and then updating it",
  inputSchema: {
    type: "object",
    properties: {
      task_name: {
        type: "string",
        description: "Name/content of the task to search for and update"
      },
      content: {
        type: "string",
        description: "New content/title for the task (optional)"
      },
      description: {
        type: "string",
        description: "New description for the task (optional)"
      },
      due_string: {
        type: "string",
        description: "New due date in natural language like 'tomorrow', 'next Monday' (optional)"
      },
      priority: {
        type: "number",
        description: "New priority level from 1 (normal) to 4 (urgent) (optional)",
        enum: [1, 2, 3, 4]
      }
    },
    required: ["task_name"]
  }
};

const DELETE_TASK_TOOL: Tool = {
  name: "todoist_delete_task",
  description: "Delete a task from Todoist by searching for it by name",
  inputSchema: {
    type: "object",
    properties: {
      task_name: {
        type: "string",
        description: "Name/content of the task to search for and delete"
      }
    },
    required: ["task_name"]
  }
};

const COMPLETE_TASK_TOOL: Tool = {
  name: "todoist_complete_task",
  description: "Mark a task as complete by searching for it by name",
  inputSchema: {
    type: "object",
    properties: {
      task_name: {
        type: "string",
        description: "Name/content of the task to search for and complete"
      }
    },
    required: ["task_name"]
  }
};

// Check for API token
const TODOIST_API_TOKEN = process.env.TODOIST_API_TOKEN!;
if (!TODOIST_API_TOKEN) {
  console.error("Error: TODOIST_API_TOKEN environment variable is required");
  process.exit(1);
}

// Initialize Todoist client
const todoistClient = new TodoistApi(TODOIST_API_TOKEN);

// Type guards for arguments
function isCreateTaskArgs(args: unknown): args is {
  content: string;
  description?: string;
  due_string?: string;
  priority?: number;
} {
  return (
    typeof args === "object" &&
    args !== null &&
    "content" in args &&
    typeof (args as { content: string }).content === "string"
  );
}

function isGetTasksArgs(args: unknown): args is {
  project_id?: string;
  filter?: string;
  priority?: number;
  limit?: number;
} {
  return (
    typeof args === "object" &&
    args !== null
  );
}

function isUpdateTaskArgs(args: unknown): args is {
  task_name: string;
  content?: string;
  description?: string;
  due_string?: string;
  priority?: number;
} {
  return (
    typeof args === "object" &&
    args !== null &&
    "task_name" in args &&
    typeof (args as { task_name: string }).task_name === "string"
  );
}

function isDeleteTaskArgs(args: unknown): args is {
  task_name: string;
} {
  return (
    typeof args === "object" &&
    args !== null &&
    "task_name" in args &&
    typeof (args as { task_name: string }).task_name === "string"
  );
}

function isCompleteTaskArgs(args: unknown): args is {
  task_name: string;
} {
  return (
    typeof args === "object" &&
    args !== null &&
    "task_name" in args &&
    typeof (args as { task_name: string }).task_name === "string"
  );
}

// Create MCP server instance
function createServer(): Server {
  const server = new Server(
    {
      name: "todoist-mcp-server",
      version: "0.2.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [CREATE_TASK_TOOL, GET_TASKS_TOOL, UPDATE_TASK_TOOL, DELETE_TASK_TOOL, COMPLETE_TASK_TOOL],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args } = request.params;

      if (!args) {
        throw new Error("No arguments provided");
      }

      if (name === "todoist_create_task") {
        if (!isCreateTaskArgs(args)) {
          throw new Error("Invalid arguments for todoist_create_task");
        }
        const task = await todoistClient.addTask({
          content: args.content,
          description: args.description,
          dueString: args.due_string,
          priority: args.priority
        });
        return {
          content: [{
            type: "text",
            text: `Task created:\nTitle: ${task.content}${task.description ? `\nDescription: ${task.description}` : ''}${task.due ? `\nDue: ${task.due.string}` : ''}${task.priority ? `\nPriority: ${task.priority}` : ''}`
          }],
          isError: false,
        };
      }

      if (name === "todoist_get_tasks") {
        if (!isGetTasksArgs(args)) {
          throw new Error("Invalid arguments for todoist_get_tasks");
        }

        // Only pass filter if at least one filtering parameter is provided
        const apiParams: any = {};
        if (args.project_id) {
          apiParams.projectId = args.project_id;
        }
        if (args.filter) {
          apiParams.filter = args.filter;
        }
        // If no filters provided, default to showing all tasks
        const tasks = await todoistClient.getTasks(Object.keys(apiParams).length > 0 ? apiParams : undefined);

        // Apply additional filters
        let filteredTasks = tasks;
        if (args.priority) {
          filteredTasks = filteredTasks.filter(task => task.priority === args.priority);
        }

        // Apply limit
        if (args.limit && args.limit > 0) {
          filteredTasks = filteredTasks.slice(0, args.limit);
        }

        const taskList = filteredTasks.map(task =>
          `- ${task.content}${task.description ? `\n  Description: ${task.description}` : ''}${task.due ? `\n  Due: ${task.due.string}` : ''}${task.priority ? `\n  Priority: ${task.priority}` : ''}`
        ).join('\n\n');

        return {
          content: [{
            type: "text",
            text: filteredTasks.length > 0 ? taskList : "No tasks found matching the criteria"
          }],
          isError: false,
        };
      }

      if (name === "todoist_update_task") {
        if (!isUpdateTaskArgs(args)) {
          throw new Error("Invalid arguments for todoist_update_task");
        }

        // First, search for the task
        const tasks = await todoistClient.getTasks();
        const matchingTask = tasks.find(task =>
          task.content.toLowerCase().includes(args.task_name.toLowerCase())
        );

        if (!matchingTask) {
          return {
            content: [{
              type: "text",
              text: `Could not find a task matching "${args.task_name}"`
            }],
            isError: true,
          };
        }

        // Build update data
        const updateData: any = {};
        if (args.content) updateData.content = args.content;
        if (args.description) updateData.description = args.description;
        if (args.due_string) updateData.dueString = args.due_string;
        if (args.priority) updateData.priority = args.priority;

        const updatedTask = await todoistClient.updateTask(matchingTask.id, updateData);

        return {
          content: [{
            type: "text",
            text: `Task "${matchingTask.content}" updated:\nNew Title: ${updatedTask.content}${updatedTask.description ? `\nNew Description: ${updatedTask.description}` : ''}${updatedTask.due ? `\nNew Due Date: ${updatedTask.due.string}` : ''}${updatedTask.priority ? `\nNew Priority: ${updatedTask.priority}` : ''}`
          }],
          isError: false,
        };
      }

      if (name === "todoist_delete_task") {
        if (!isDeleteTaskArgs(args)) {
          throw new Error("Invalid arguments for todoist_delete_task");
        }

        // First, search for the task
        const tasks = await todoistClient.getTasks();
        const matchingTask = tasks.find(task =>
          task.content.toLowerCase().includes(args.task_name.toLowerCase())
        );

        if (!matchingTask) {
          return {
            content: [{
              type: "text",
              text: `Could not find a task matching "${args.task_name}"`
            }],
            isError: true,
          };
        }

        // Delete the task
        await todoistClient.deleteTask(matchingTask.id);

        return {
          content: [{
            type: "text",
            text: `Successfully deleted task: "${matchingTask.content}"`
          }],
          isError: false,
        };
      }

      if (name === "todoist_complete_task") {
        if (!isCompleteTaskArgs(args)) {
          throw new Error("Invalid arguments for todoist_complete_task");
        }

        // First, search for the task
        const tasks = await todoistClient.getTasks();
        const matchingTask = tasks.find(task =>
          task.content.toLowerCase().includes(args.task_name.toLowerCase())
        );

        if (!matchingTask) {
          return {
            content: [{
              type: "text",
              text: `Could not find a task matching "${args.task_name}"`
            }],
            isError: true,
          };
        }

        // Complete the task
        await todoistClient.closeTask(matchingTask.id);

        return {
          content: [{
            type: "text",
            text: `Successfully completed task: "${matchingTask.content}"`
          }],
          isError: false,
        };
      }

      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

// Bearer token authentication middleware
function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

  if (!MCP_AUTH_TOKEN) {
    console.error("Warning: MCP_AUTH_TOKEN not set, authentication disabled");
    next();
    return;
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized: Missing Bearer token" });
    return;
  }

  const token = authHeader.substring(7);

  if (token !== MCP_AUTH_TOKEN) {
    res.status(401).json({ error: "Unauthorized: Invalid token" });
    return;
  }

  next();
}

// Run server in stdio mode (for local Claude Desktop)
async function runStdioServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Todoist MCP Server running on stdio");
}

// Run server in HTTP mode (for Railway deployment)
async function runHttpServer() {
  const app = express();
  app.use(express.json());

  // Store active transports by session ID
  const transports: Map<string, StreamableHTTPServerTransport> = new Map();

  // Health check endpoint (no auth required)
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "healthy",
      service: "Todoist MCP Server",
      version: "0.2.0",
      timestamp: new Date().toISOString(),
      transport: "http",
      auth_enabled: !!process.env.MCP_AUTH_TOKEN,
    });
  });

  // MCP endpoint handlers (auth required)
  app.post("/mcp", authMiddleware, async (req: Request, res: Response) => {
    try {
      // Check for existing session
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports.has(sessionId)) {
        // Reuse existing transport
        transport = transports.get(sessionId)!;
      } else {
        // Create new transport for new session
        const server = createServer();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (newSessionId) => {
            transports.set(newSessionId, transport);
            console.log(`New session initialized: ${newSessionId}`);
          },
        });

        // Clean up on transport close
        transport.onclose = () => {
          const sid = (transport as any).sessionId;
          if (sid) {
            transports.delete(sid);
            console.log(`Session closed: ${sid}`);
          }
        };

        await server.connect(transport);
      }

      // Handle the request
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  app.get("/mcp", authMiddleware, async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }

    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  });

  app.delete("/mcp", authMiddleware, async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }

    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
    transports.delete(sessionId);
  });

  const port = parseInt(process.env.PORT || "8000", 10);
  const host = process.env.HOST || "0.0.0.0";

  app.listen(port, host, () => {
    console.log(`Todoist MCP Server running on http://${host}:${port}`);
    console.log(`Health check: http://${host}:${port}/health`);
    console.log(`MCP endpoint: http://${host}:${port}/mcp`);
    console.log(`Auth enabled: ${!!process.env.MCP_AUTH_TOKEN}`);
  });
}

// Main entry point
async function main() {
  const transportMode = process.env.TRANSPORT_MODE?.toLowerCase() || "stdio";

  console.log(`Starting Todoist MCP Server v0.2.0`);
  console.log(`Transport mode: ${transportMode}`);

  if (transportMode === "http") {
    await runHttpServer();
  } else {
    await runStdioServer();
  }
}

main().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
