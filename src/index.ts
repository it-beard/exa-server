#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const API_KEY = process.env.EXA_API_KEY;
if (!API_KEY) {
  throw new Error("EXA_API_KEY environment variable is required");
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface StoredSearches {
  searches: { [query: string]: any };
  lastQuery: string | null;
}

class ExaServer {
  private server: Server;
  private axiosInstance;
  private searches: StoredSearches = { searches: {}, lastQuery: null };
  private dataDir: string;
  private storageFile: string;

  constructor() {
    this.server = new Server(
      {
        name: "exa-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    this.axiosInstance = axios.create({
      baseURL: "https://api.exa.ai/search",
      headers: {
        "x-api-key": API_KEY,
        "Content-Type": "application/json",
      },
    });

    this.dataDir = join(__dirname, '..', 'data');
    this.storageFile = join(this.dataDir, 'searches.json');

    this.setupToolHandlers();
    this.setupResourceHandlers();
    
    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async initializeStorage() {
    try {
      await mkdir(this.dataDir, { recursive: true });
      try {
        const data = await readFile(this.storageFile, 'utf-8');
        this.searches = JSON.parse(data);
      } catch (error) {
        this.searches = { searches: {}, lastQuery: null };
        await this.saveSearches();
      }
    } catch (error) {
      console.error('Failed to initialize storage:', error);
      throw new Error('Failed to initialize storage');
    }
  }

  private async saveSearches() {
    try {
      await writeFile(this.storageFile, JSON.stringify(this.searches, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save searches:', error);
      throw new Error('Failed to save searches');
    }
  }

  private async saveSearch(query: string, result: any) {
    this.searches.searches[query] = result;
    this.searches.lastQuery = query;
    await this.saveSearches();
  }

  private formatSearchResults(data: any) {
    const results = data.results.map((result: any) => ({
      title: result.title,
      score: result.score,
      publishedDate: result.publishedDate,
      author: result.author,
      content: result.text || "No content available",
    }));

    return {
      requestId: data.requestId,
      resolvedSearchType: data.resolvedSearchType,
      results,
    };
  }

  private setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: "exa://last-search/result",
          name: "Last Search Result",
          description: "Results from the most recent search query",
          mimeType: "application/json",
        },
      ],
    }));

    this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
      resourceTemplates: [
        {
          uriTemplate: "exa://search/{query}",
          name: "Search Results by Query",
          description: "Search results for a specific query",
          mimeType: "application/json",
        },
      ],
    }));

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      if (uri === "exa://last-search/result") {
        if (!this.searches.lastQuery || !this.searches.searches[this.searches.lastQuery]) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            "No search has been performed yet"
          );
        }
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(this.formatSearchResults(this.searches.searches[this.searches.lastQuery]), null, 2),
            },
          ],
        };
      }

      const searchMatch = uri.match(/^exa:\/\/search\/(.+)$/);
      if (searchMatch) {
        const query = decodeURIComponent(searchMatch[1]);

        if (this.searches.searches[query]) {
          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(this.formatSearchResults(this.searches.searches[query]), null, 2),
              },
            ],
          };
        }

        try {
          const response = await this.axiosInstance.post("", {
            query,
            type: "neural",
            numResults: 10,
            contents: {
              text: true
            }
          });

          await this.saveSearch(query, response.data);

          return {
            contents: [
              {
                uri,
                mimeType: "application/json",
                text: JSON.stringify(this.formatSearchResults(response.data), null, 2),
              },
            ],
          };
        } catch (error) {
          if (axios.isAxiosError(error)) {
            const errorMessage = error.response?.data?.error ?? error.response?.data?.message ?? error.message;
            throw new McpError(
              ErrorCode.InternalError,
              `Exa API error: ${errorMessage}`
            );
          }
          throw error;
        }
      }

      throw new McpError(
        ErrorCode.InvalidRequest,
        `Invalid resource URI: ${uri}`
      );
    });
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "search",
          description: "Perform an AI-powered search using Exa API",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query",
              },
              numResults: {
                type: "number",
                description: "Number of results to return (default: 10)",
                minimum: 1,
                maximum: 100,
              }
            },
            required: ["query"],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== "search") {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      }

      const { query, numResults = 10 } = request.params.arguments as {
        query: string;
        numResults?: number;
      };

      try {
        const response = await this.axiosInstance.post("", {
          query,
          type: "neural",
          numResults,
          contents: {
            text: true
          }
        });

        await this.saveSearch(query, response.data);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(this.formatSearchResults(response.data), null, 2),
            },
          ],
        };
      } catch (error) {
        if (axios.isAxiosError(error)) {
          const errorMessage = error.response?.data?.error ?? error.response?.data?.message ?? error.message;
          console.error("Full error response:", error.response?.data);
          throw new McpError(
            ErrorCode.InternalError,
            `Exa API error: ${errorMessage}`
          );
        }
        throw error;
      }
    });
  }

  async run() {
    await this.initializeStorage();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Exa MCP server running on stdio");
  }
}

const server = new ExaServer();
server.run().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
