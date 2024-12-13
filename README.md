# Exa MCP Server

An MCP (Model Context Protocol) server that provides AI-powered code search capabilities using the Exa API.

## Features

- Perform AI-powered code searches using natural language queries
- Get relevant code examples and documentation
- Configurable number of search results
- JSON response format with rich metadata

## Installation

1. Clone this repository:
```bash
git clone https://github.com/it-beard/exo-server.git
cd exa-server
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Configure your Exa API key in the MCP settings file (tested with Cline):
```json
{
  "mcpServers": {
    "exa": {
      "command": "node",
      "args": ["/path/to/exa-server/build/index.js"],
      "env": {
        "EXA_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Usage

The server provides the following tools and resources:

### Tools

#### search
Perform an AI-powered search using Exa API

Input Schema:
```json
{
  "query": "Search query",
  "numResults": 10
}
```

### Resources

- `exa://search/{query}` - Search results for a specific query
- `exa://last-search/result` - Results from the most recent search query

## Development

1. Make your changes in the `src` directory
2. Build the project:
```bash
npm run build
```
3. Test your changes by configuring the server in your MCP settings

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
