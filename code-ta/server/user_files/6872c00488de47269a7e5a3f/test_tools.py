#!/usr/bin/env python3
"""
AI File Management Toolkit - Hands for Gemini AI
A comprehensive set of tools for AI to interact with files and directories
"""

import os
import json
import shutil
import subprocess
import fnmatch
from pathlib import Path
from typing import List, Dict, Any, Optional
import mimetypes
import hashlib

class FileViewerTool:
    """Tool for viewing and reading files"""
    
    def __init__(self):
        self.name = "file_viewer"
        self.description = "View and read file contents"
    
    def read_file(self, file_path: str, encoding: str = 'utf-8') -> Dict[str, Any]:
        """Read and return file contents"""
        try:
            path = Path(file_path)
            if not path.exists():
                return {"error": f"File not found: {file_path}"}
            
            if path.is_dir():
                return {"error": f"Path is a directory, not a file: {file_path}"}
            
            # Check file size (limit to 10MB for safety)
            if path.stat().st_size > 10 * 1024 * 1024:
                return {"error": "File too large (>10MB)"}
            
            # Determine if file is binary
            mime_type, _ = mimetypes.guess_type(file_path)
            is_binary = mime_type and not mime_type.startswith('text/')
            
            if is_binary:
                return {
                    "file_path": file_path,
                    "file_size": path.stat().st_size,
                    "mime_type": mime_type,
                    "is_binary": True,
                    "message": "Binary file - content not displayed"
                }
            
            with open(path, 'r', encoding=encoding) as f:
                content = f.read()
            
            return {
                "file_path": file_path,
                "file_size": path.stat().st_size,
                "mime_type": mime_type,
                "content": content,
                "lines": len(content.splitlines()),
                "is_binary": False
            }
            
        except Exception as e:
            return {"error": f"Error reading file: {str(e)}"}
    
    def get_file_info(self, file_path: str) -> Dict[str, Any]:
        """Get detailed file information"""
        try:
            path = Path(file_path)
            if not path.exists():
                return {"error": f"File not found: {file_path}"}
            
            stat = path.stat()
            return {
                "file_path": file_path,
                "file_name": path.name,
                "file_size": stat.st_size,
                "is_file": path.is_file(),
                "is_dir": path.is_dir(),
                "is_symlink": path.is_symlink(),
                "mime_type": mimetypes.guess_type(file_path)[0],
                "created_time": stat.st_ctime,
                "modified_time": stat.st_mtime,
                "permissions": oct(stat.st_mode)[-3:],
                "parent_dir": str(path.parent)
            }
            
        except Exception as e:
            return {"error": f"Error getting file info: {str(e)}"}


class DirectoryExplorerTool:
    """Tool for exploring directories and listing files"""
    
    def __init__(self):
        self.name = "directory_explorer"
        self.description = "Explore directories and list files"
    
    def list_directory(self, dir_path: str = ".", show_hidden: bool = False, recursive: bool = False) -> Dict[str, Any]:
        """List contents of a directory"""
        try:
            path = Path(dir_path)
            if not path.exists():
                return {"error": f"Directory not found: {dir_path}"}
            
            if not path.is_dir():
                return {"error": f"Path is not a directory: {dir_path}"}
            
            items = []
            
            if recursive:
                for item in path.rglob('*'):
                    if not show_hidden and item.name.startswith('.'):
                        continue
                    items.append(self._get_item_info(item))
            else:
                for item in path.iterdir():
                    if not show_hidden and item.name.startswith('.'):
                        continue
                    items.append(self._get_item_info(item))
            
            return {
                "directory_path": str(path.absolute()),
                "total_items": len(items),
                "items": sorted(items, key=lambda x: (not x['is_dir'], x['name'].lower()))
            }
            
        except Exception as e:
            return {"error": f"Error listing directory: {str(e)}"}
    
    def _get_item_info(self, path: Path) -> Dict[str, Any]:
        """Get basic info about a file/directory item"""
        try:
            stat = path.stat()
            return {
                "name": path.name,
                "path": str(path),
                "is_dir": path.is_dir(),
                "is_file": path.is_file(),
                "size": stat.st_size if path.is_file() else 0,
                "modified": stat.st_mtime,
                "permissions": oct(stat.st_mode)[-3:]
            }
        except:
            return {
                "name": path.name,
                "path": str(path),
                "is_dir": path.is_dir(),
                "is_file": path.is_file(),
                "size": 0,
                "modified": 0,
                "permissions": "000"
            }
    
    def get_directory_tree(self, dir_path: str = ".", max_depth: int = 3) -> Dict[str, Any]:
        """Get a tree structure of the directory"""
        try:
            path = Path(dir_path)
            if not path.exists():
                return {"error": f"Directory not found: {dir_path}"}
            
            def build_tree(current_path: Path, current_depth: int = 0) -> Dict[str, Any]:
                if current_depth > max_depth:
                    return {"name": current_path.name, "type": "depth_limit"}
                
                tree = {
                    "name": current_path.name,
                    "path": str(current_path),
                    "type": "directory" if current_path.is_dir() else "file"
                }
                
                if current_path.is_dir():
                    tree["children"] = []
                    try:
                        for item in current_path.iterdir():
                            if not item.name.startswith('.'):
                                tree["children"].append(build_tree(item, current_depth + 1))
                    except PermissionError:
                        tree["children"] = [{"name": "Permission Denied", "type": "error"}]
                
                return tree
            
            return build_tree(path)
            
        except Exception as e:
            return {"error": f"Error building directory tree: {str(e)}"}


class FileSearchTool:
    """Tool for searching files and content"""
    
    def __init__(self):
        self.name = "file_search"
        self.description = "Search for files and content within files"
    
    def search_files(self, directory: str = ".", pattern: str = "*", recursive: bool = True) -> Dict[str, Any]:
        """Search for files matching a pattern"""
        try:
            path = Path(directory)
            if not path.exists():
                return {"error": f"Directory not found: {directory}"}
            
            matches = []
            
            if recursive:
                for file_path in path.rglob(pattern):
                    if file_path.is_file():
                        matches.append(str(file_path))
            else:
                for file_path in path.glob(pattern):
                    if file_path.is_file():
                        matches.append(str(file_path))
            
            return {
                "search_directory": str(path.absolute()),
                "pattern": pattern,
                "recursive": recursive,
                "matches_found": len(matches),
                "matches": matches
            }
            
        except Exception as e:
            return {"error": f"Error searching files: {str(e)}"}
    
    def search_content(self, directory: str = ".", search_text: str = "", file_pattern: str = "*", case_sensitive: bool = False) -> Dict[str, Any]:
        """Search for text content within files"""
        try:
            path = Path(directory)
            if not path.exists():
                return {"error": f"Directory not found: {directory}"}
            
            matches = []
            
            for file_path in path.rglob(file_pattern):
                if file_path.is_file():
                    try:
                        # Skip binary files
                        mime_type, _ = mimetypes.guess_type(str(file_path))
                        if mime_type and not mime_type.startswith('text/'):
                            continue
                        
                        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                            content = f.read()
                        
                        search_in = content if case_sensitive else content.lower()
                        search_for = search_text if case_sensitive else search_text.lower()
                        
                        if search_for in search_in:
                            # Find line numbers
                            lines = content.splitlines()
                            matching_lines = []
                            for i, line in enumerate(lines, 1):
                                line_check = line if case_sensitive else line.lower()
                                if search_for in line_check:
                                    matching_lines.append({"line_number": i, "content": line.strip()})
                            
                            matches.append({
                                "file_path": str(file_path),
                                "matches_in_file": len(matching_lines),
                                "matching_lines": matching_lines[:10]  # Limit to first 10 matches
                            })
                    
                    except Exception:
                        continue  # Skip files that can't be read
            
            return {
                "search_directory": str(path.absolute()),
                "search_text": search_text,
                "file_pattern": file_pattern,
                "case_sensitive": case_sensitive,
                "files_with_matches": len(matches),
                "matches": matches
            }
            
        except Exception as e:
            return {"error": f"Error searching content: {str(e)}"}


class FileEditorTool:
    """Tool for editing files"""
    
    def __init__(self):
        self.name = "file_editor"
        self.description = "Create, edit, and modify files"
    
    def create_file(self, file_path: str, content: str = "", encoding: str = 'utf-8') -> Dict[str, Any]:
        """Create a new file with content"""
        try:
            path = Path(file_path)
            
            # Create parent directories if they don't exist
            path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(path, 'w', encoding=encoding) as f:
                f.write(content)
            
            return {
                "action": "create",
                "file_path": str(path.absolute()),
                "content_length": len(content),
                "success": True
            }
            
        except Exception as e:
            return {"error": f"Error creating file: {str(e)}"}
    
    def edit_file(self, file_path: str, content: str, encoding: str = 'utf-8', backup: bool = True) -> Dict[str, Any]:
        """Edit/overwrite a file with new content"""
        try:
            path = Path(file_path)
            
            if not path.exists():
                return {"error": f"File not found: {file_path}"}
            
            # Create backup if requested
            if backup:
                backup_path = path.with_suffix(path.suffix + '.backup')
                shutil.copy2(path, backup_path)
            
            with open(path, 'w', encoding=encoding) as f:
                f.write(content)
            
            return {
                "action": "edit",
                "file_path": str(path.absolute()),
                "content_length": len(content),
                "backup_created": backup,
                "success": True
            }
            
        except Exception as e:
            return {"error": f"Error editing file: {str(e)}"}
    
    def append_to_file(self, file_path: str, content: str, encoding: str = 'utf-8') -> Dict[str, Any]:
        """Append content to a file"""
        try:
            path = Path(file_path)
            
            with open(path, 'a', encoding=encoding) as f:
                f.write(content)
            
            return {
                "action": "append",
                "file_path": str(path.absolute()),
                "content_length": len(content),
                "success": True
            }
            
        except Exception as e:
            return {"error": f"Error appending to file: {str(e)}"}
    
    def insert_at_line(self, file_path: str, line_number: int, content: str, encoding: str = 'utf-8') -> Dict[str, Any]:
        """Insert content at a specific line number"""
        try:
            path = Path(file_path)
            
            if not path.exists():
                return {"error": f"File not found: {file_path}"}
            
            with open(path, 'r', encoding=encoding) as f:
                lines = f.readlines()
            
            # Insert at line number (1-based)
            if line_number <= 0:
                lines.insert(0, content + '\n')
            elif line_number > len(lines):
                lines.append(content + '\n')
            else:
                lines.insert(line_number - 1, content + '\n')
            
            with open(path, 'w', encoding=encoding) as f:
                f.writelines(lines)
            
            return {
                "action": "insert",
                "file_path": str(path.absolute()),
                "line_number": line_number,
                "content": content,
                "success": True
            }
            
        except Exception as e:
            return {"error": f"Error inserting content: {str(e)}"}


class FileManagerTool:
    """Tool for managing files (copy, move, delete, etc.)"""
    
    def __init__(self):
        self.name = "file_manager"
        self.description = "Manage files and directories (copy, move, delete, rename)"
    
    def copy_file(self, source: str, destination: str, overwrite: bool = False) -> Dict[str, Any]:
        """Copy a file or directory"""
        try:
            src_path = Path(source)
            dst_path = Path(destination)
            
            if not src_path.exists():
                return {"error": f"Source not found: {source}"}
            
            if dst_path.exists() and not overwrite:
                return {"error": f"Destination exists and overwrite=False: {destination}"}
            
            if src_path.is_dir():
                shutil.copytree(src_path, dst_path, dirs_exist_ok=overwrite)
            else:
                dst_path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src_path, dst_path)
            
            return {
                "action": "copy",
                "source": str(src_path.absolute()),
                "destination": str(dst_path.absolute()),
                "type": "directory" if src_path.is_dir() else "file",
                "success": True
            }
            
        except Exception as e:
            return {"error": f"Error copying: {str(e)}"}
    
    def move_file(self, source: str, destination: str, overwrite: bool = False) -> Dict[str, Any]:
        """Move/rename a file or directory"""
        try:
            src_path = Path(source)
            dst_path = Path(destination)
            
            if not src_path.exists():
                return {"error": f"Source not found: {source}"}
            
            if dst_path.exists() and not overwrite:
                return {"error": f"Destination exists and overwrite=False: {destination}"}
            
            dst_path.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src_path), str(dst_path))
            
            return {
                "action": "move",
                "source": source,
                "destination": str(dst_path.absolute()),
                "type": "directory" if dst_path.is_dir() else "file",
                "success": True
            }
            
        except Exception as e:
            return {"error": f"Error moving: {str(e)}"}
    
    def delete_file(self, file_path: str, force: bool = False) -> Dict[str, Any]:
        """Delete a file or directory"""
        try:
            path = Path(file_path)
            
            if not path.exists():
                return {"error": f"File not found: {file_path}"}
            
            if path.is_dir():
                if force:
                    shutil.rmtree(path)
                else:
                    path.rmdir()  # Only works if directory is empty
            else:
                path.unlink()
            
            return {
                "action": "delete",
                "file_path": file_path,
                "type": "directory" if path.is_dir() else "file",
                "success": True
            }
            
        except Exception as e:
            return {"error": f"Error deleting: {str(e)}"}
    
    def create_directory(self, dir_path: str, parents: bool = True) -> Dict[str, Any]:
        """Create a directory"""
        try:
            path = Path(dir_path)
            path.mkdir(parents=parents, exist_ok=True)
            
            return {
                "action": "create_directory",
                "directory_path": str(path.absolute()),
                "success": True
            }
            
        except Exception as e:
            return {"error": f"Error creating directory: {str(e)}"}


class CommandExecutorTool:
    """Tool for executing system commands"""
    
    def __init__(self):
        self.name = "command_executor"
        self.description = "Execute system commands safely"
    
    def execute_command(self, command: str, working_directory: str = ".", timeout: int = 30) -> Dict[str, Any]:
        """Execute a system command"""
        try:
            # Security: Only allow safe commands
            safe_commands = [
                'ls', 'dir', 'pwd', 'cd', 'cat', 'head', 'tail', 'grep',
                'find', 'wc', 'sort', 'uniq', 'cut', 'awk', 'sed',
                'git', 'npm', 'pip', 'python', 'node', 'java', 'javac',
                'gcc', 'make', 'cmake', 'docker', 'kubectl'
            ]
            
            command_parts = command.split()
            if not command_parts:
                return {"error": "Empty command"}
            
            base_command = command_parts[0]
            if base_command not in safe_commands:
                return {"error": f"Command not allowed: {base_command}"}
            
            result = subprocess.run(
                command,
                shell=True,
                cwd=working_directory,
                capture_output=True,
                text=True,
                timeout=timeout
            )
            
            return {
                "command": command,
                "working_directory": working_directory,
                "return_code": result.returncode,
                "stdout": result.stdout,
                "stderr": result.stderr,
                "success": result.returncode == 0
            }
            
        except subprocess.TimeoutExpired:
            return {"error": f"Command timed out after {timeout} seconds"}
        except Exception as e:
            return {"error": f"Error executing command: {str(e)}"}


class AIFileToolkit:
    """Main toolkit class that combines all tools"""
    
    def __init__(self):
        self.tools = {
            'file_viewer': FileViewerTool(),
            'directory_explorer': DirectoryExplorerTool(),
            'file_search': FileSearchTool(),
            'file_editor': FileEditorTool(),
            'file_manager': FileManagerTool(),
            'command_executor': CommandExecutorTool()
        }
    
    def get_available_tools(self) -> Dict[str, str]:
        """Get list of available tools and their descriptions"""
        return {name: tool.description for name, tool in self.tools.items()}
    
    def use_tool(self, tool_name: str, method_name: str, **kwargs) -> Dict[str, Any]:
        """Use a specific tool method"""
        if tool_name not in self.tools:
            return {"error": f"Tool not found: {tool_name}"}
        
        tool = self.tools[tool_name]
        if not hasattr(tool, method_name):
            return {"error": f"Method not found: {method_name}"}
        
        method = getattr(tool, method_name)
        return method(**kwargs)


# Example usage and tool descriptions for AI
def main():
    """Example usage of the AI File Toolkit"""
    
    toolkit = AIFileToolkit()
    
    print("=== AI File Management Toolkit ===")
    print("Available tools:")
    for tool_name, description in toolkit.get_available_tools().items():
        print(f"- {tool_name}: {description}")
    
    print("\n=== Tool Usage Examples ===")
    
    # Example 1: List current directory
    print("\n1. List current directory:")
    result = toolkit.use_tool('directory_explorer', 'list_directory', dir_path=".")
    print(json.dumps(result, indent=2))
    
    # Example 2: Search for Python files
    print("\n2. Search for Python files:")
    result = toolkit.use_tool('file_search', 'search_files', pattern="*.py")
    print(json.dumps(result, indent=2))
    
    # Example 3: Create a test file
    print("\n3. Create a test file:")
    result = toolkit.use_tool('file_editor', 'create_file', 
                             file_path="test_file.txt", 
                             content="Hello from AI!")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()