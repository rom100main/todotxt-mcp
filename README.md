# Todo.txt MCP Server

A minimal MCP for managing todo.txt files, enabling AI assistants to interact with your tasks using the standardized todo.txt format.

## Features

- **List tasks** - View all tasks from your todo.txt file
- **Add tasks** - Add one or multiple tasks at once
- **Complete tasks** - Mark tasks as complete
- **Remove tasks** - Delete individual tasks or clear all tasks
- **Update tasks** - Modify task descriptions
- **Auto-create todo.txt** - Automatically creates the file if it doesn't exist

## Installation

Add to your MCP client configuration:
```json
{
    "mcpServers": {
        "todotxt": {
            "command": "npx",
            "args": ["-y", "todotxt-mcp"],
        }
    }
}
```

## Support

For bug reports and feature requests, please fill an issue at [GitHub repository](https://github.com/rom100main/todotxt-mcp/issues).

## Changelog

See [CHANGELOG](CHANGELOG.md) for a list of changes in each version.

## Development

For development information, see [CONTRIBUTING](CONTRIBUTING.md).

## License

MIT
