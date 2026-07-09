import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { getApiUrl } from '../config/api';
import { 
  Play, 
  Square, // Use Square instead of Stop
  Save, 
  Download, 
  Upload, 
  Settings, 
  CheckCircle, 
  XCircle, 
  Clock,
  Code,
  FileText,
  Terminal,
  Zap
} from 'lucide-react';

interface Language {
  id: string;
  name: string;
  extension: string;
  image: string;
}

interface TestCase {
  input: string;
  expectedOutput: string;
}

interface ExecutionResult {
  sessionId: string;
  status: 'running' | 'completed' | 'error' | 'stopped';
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  output: string[];
}

interface TestCaseResult {
  testCase: number;
  input: string;
  expectedOutput: string;
  actualOutput: string;
  passed: boolean;
  error: string | null;
  duration: number;
}

interface TestCaseSummary {
  total: number;
  passed: number;
  failed: number;
  allPassed: boolean;
}

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const DEFAULT_CODE = {
  python: `# Python 3
print("Hello, World!")`,
  javascript: `// JavaScript
console.log("Hello, World!");`,
  typescript: `// TypeScript
console.log("Hello, World!");`,
  java: `// Java
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}`,
  cpp: `// C++
#include <iostream>
using namespace std;

int main() {
    cout << "Hello, World!" << endl;
    return 0;
}`,
  c: `// C
#include <stdio.h>

int main() {
    printf("Hello, World!\\n");
    return 0;
}`,
  csharp: `// C#
using System;

class Program {
    static void Main() {
        Console.WriteLine("Hello, World!");
    }
}`,
  go: `// Go
package main

import "fmt"

func main() {
    fmt.Println("Hello, World!")
}`,
  rust: `// Rust
fn main() {
    println!("Hello, World!");
}`,
  php: `<?php
// PHP
echo "Hello, World!";
?>`,
  ruby: `# Ruby
puts "Hello, World!"`,
  swift: `// Swift
print("Hello, World!")`,
  kotlin: `// Kotlin
fun main() {
    println("Hello, World!")
}`,
  scala: `// Scala
object Main {
  def main(args: Array[String]): Unit = {
    println("Hello, World!")
  }
}`,
  bash: `#!/bin/bash
# Bash
echo "Hello, World!"`
};

const OnlineJudge: React.FC = () => {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('python');
  const [code, setCode] = useState<string>(DEFAULT_CODE.python);
  const [input, setInput] = useState<string>('');
  const [output, setOutput] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [testCaseResults, setTestCaseResults] = useState<TestCaseResult[]>([]);
  const [testCaseSummary, setTestCaseSummary] = useState<TestCaseSummary | null>(null);
  const [showTestCases, setShowTestCases] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'code' | 'testcases' | 'output'>('code');
  const [theme, setTheme] = useState<'vs-dark' | 'light'>('vs-dark');
  const [fontSize, setFontSize] = useState<number>(14);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [backendConnected, setBackendConnected] = useState<boolean>(false);

  const editorRef = useRef<any>(null);
  const executionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check backend connection
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await axios.get(getApiUrl('health'));
        if (response.data.status === 'ok') {
          setBackendConnected(true);
          toast.success('Backend connected successfully!');
        }
      } catch (error) {
        console.error('Backend connection failed:', error);
        setBackendConnected(false);
        toast.error('Cannot connect to backend. Please ensure backend is running on port 5000.');
      }
    };
    
    checkBackend();
  }, []);

  // Fetch supported languages
  useEffect(() => {
    const fetchLanguages = async () => {
      try {
        const response = await axios.get(getApiUrl('languages'));
        setLanguages(response.data);
      } catch (error) {
        console.error('Failed to fetch languages:', error);
        toast.error('Failed to load supported languages');
      }
    };
    
    if (backendConnected) {
      fetchLanguages();
    }
  }, [backendConnected]);

  // Update code when language changes
  useEffect(() => {
    const defaultCode = DEFAULT_CODE[selectedLanguage as keyof typeof DEFAULT_CODE] || DEFAULT_CODE.python;
    setCode(defaultCode);
  }, [selectedLanguage]);

  // Execute code
  const executeCode = async () => {
    if (!backendConnected) {
      toast.error('Backend not connected. Please ensure backend is running.');
      return;
    }

    if (!code.trim()) {
      toast.error('Please enter some code to execute');
      return;
    }

    setIsExecuting(true);
    setOutput('Executing...\n');
    setExecutionResult(null);

    try {
      const response = await axios.post(getApiUrl('execute'), {
        code,
        language: selectedLanguage,
        input: input.trim() || undefined
      });

      const result: ExecutionResult = response.data;
      setExecutionResult(result);
      
      let outputText = '';
      if (result.stdout) {
        outputText += `Output:\n${result.stdout}\n`;
      }
      if (result.stderr) {
        outputText += `Errors:\n${result.stderr}\n`;
      }
      if (result.exitCode !== 0) {
        outputText += `Exit Code: ${result.exitCode}\n`;
      }
      outputText += `Execution Time: ${result.duration}ms\n`;

      setOutput(outputText);
      
      if (result.status === 'completed' && result.exitCode === 0) {
        toast.success('Code executed successfully!');
      } else {
        toast.error('Code execution failed');
      }

    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'Execution failed';
      setOutput(`Error: ${errorMessage}\n`);
      toast.error('Code execution failed');
    } finally {
      setIsExecuting(false);
    }
  };

  // Execute with test cases
  const executeTestCases = async () => {
    if (!backendConnected) {
      toast.error('Backend not connected. Please ensure backend is running.');
      return;
    }

    if (!code.trim()) {
      toast.error('Please enter some code to execute');
      return;
    }

    if (testCases.length === 0) {
      toast.error('Please add at least one test case');
      return;
    }

    setIsExecuting(true);
    setOutput('Running test cases...\n');
    setTestCaseResults([]);
    setTestCaseSummary(null);

    try {
      const response = await axios.post(getApiUrl('execute/testcases'), {
        code,
        language: selectedLanguage,
        testCases
      });

      const { results, summary } = response.data;
      setTestCaseResults(results);
      setTestCaseSummary(summary);

      let outputText = `Test Results:\n`;
      outputText += `Total: ${summary.total}, Passed: ${summary.passed}, Failed: ${summary.failed}\n\n`;

      results.forEach((result: TestCaseResult) => {
        outputText += `Test Case ${result.testCase}:\n`;
        outputText += `Input: ${result.input}\n`;
        outputText += `Expected: ${result.expectedOutput}\n`;
        outputText += `Actual: ${result.actualOutput || 'No output'}\n`;
        outputText += `Status: ${result.passed ? 'PASSED' : 'FAILED'}\n`;
        if (result.error) {
          outputText += `Error: ${result.error}\n`;
        }
        outputText += `Time: ${result.duration}ms\n\n`;
      });

      setOutput(outputText);

      if (summary.allPassed) {
        toast.success('All test cases passed! 🎉');
      } else {
        toast.error(`${summary.failed} test case(s) failed`);
      }

    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'Test execution failed';
      setOutput(`Error: ${errorMessage}\n`);
      toast.error('Test execution failed');
    } finally {
      setIsExecuting(false);
    }
  };

  // Stop execution
  const stopExecution = async () => {
    if (executionResult?.sessionId) {
      try {
        await axios.delete(getApiUrl(`execute/${executionResult.sessionId}`));
        setOutput('Execution stopped by user\n');
        toast('Execution stopped');
      } catch (error) {
        console.error('Failed to stop execution:', error);
      }
    }
    setIsExecuting(false);
  };

  // Add test case
  const addTestCase = () => {
    setTestCases([...testCases, { input: '', expectedOutput: '' }]);
  };

  // Update test case
  const updateTestCase = (index: number, field: 'input' | 'expectedOutput', value: string) => {
    const updated = [...testCases];
    updated[index][field] = value;
    setTestCases(updated);
  };

  // Remove test case
  const removeTestCase = (index: number) => {
    setTestCases(testCases.filter((_, i) => i !== index));
  };

  // Save code
  const saveCode = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `code.${languages.find(l => l.id === selectedLanguage)?.extension || 'txt'}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Code saved!');
  };

  // Load code
  const loadCode = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setCode(content);
        toast.success('Code loaded!');
      };
      reader.readAsText(file);
    }
  };

  // Clear output
  const clearOutput = () => {
    setOutput('');
    setExecutionResult(null);
    setTestCaseResults([]);
    setTestCaseSummary(null);
  };

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Code className="w-8 h-8 text-blue-400" />
            <h1 className="text-2xl font-bold">Online Judge</h1>
            <div className={`px-2 py-1 rounded text-xs ${
              backendConnected ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
            }`}>
              {backendConnected ? 'Backend Connected' : 'Backend Disconnected'}
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Language Selector */}
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
              disabled={!backendConnected}
            >
              {languages.map((lang) => (
                <option key={lang.id} value={lang.id}>
                  {lang.name}
                </option>
              ))}
            </select>

            {/* Settings */}
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 hover:bg-gray-700 rounded"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="mt-4 p-4 bg-gray-700 rounded">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Theme</label>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as 'vs-dark' | 'light')}
                  className="bg-gray-600 border border-gray-500 rounded px-3 py-2 text-sm w-full"
                >
                  <option value="vs-dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Font Size</label>
                <input
                  type="range"
                  min="10"
                  max="24"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full"
                />
                <span className="text-sm">{fontSize}px</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Left Panel - Code Editor */}
        <div className="flex-1 flex flex-col">
          {/* Tabs */}
          <div className="bg-gray-800 border-b border-gray-700">
            <div className="flex">
              <button
                onClick={() => setActiveTab('code')}
                className={`px-4 py-2 text-sm font-medium ${
                  activeTab === 'code' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Code className="w-4 h-4 inline mr-2" />
                Code
              </button>
              <button
                onClick={() => setActiveTab('testcases')}
                className={`px-4 py-2 text-sm font-medium ${
                  activeTab === 'testcases' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <FileText className="w-4 h-4 inline mr-2" />
                Test Cases
              </button>
              <button
                onClick={() => setActiveTab('output')}
                className={`px-4 py-2 text-sm font-medium ${
                  activeTab === 'output' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Terminal className="w-4 h-4 inline mr-2" />
                Output
              </button>
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1">
            {activeTab === 'code' && (
              <div className="h-full">
                <Editor
                  height="100%"
                  language={selectedLanguage}
                  theme={theme}
                  value={code}
                  onChange={(value) => setCode(value || '')}
                  options={{
                    fontSize: fontSize,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    wordWrap: 'on',
                    lineNumbers: 'on',
                    roundedSelection: false,
                    scrollbar: {
                      vertical: 'visible',
                      horizontal: 'visible'
                    },
                    // Disable problematic features
                    suggestOnTriggerCharacters: false,
                    quickSuggestions: false,
                    parameterHints: { enabled: false },
                    hover: { enabled: false },
                    contextmenu: false,
                    find: { addExtraSpaceOnTop: false },
                    folding: false,
                    links: false,
                    colorDecorators: false,
                    lightbulb: { enabled: false },
                    codeActionsOnSave: {},
                    codeActionsOnSaveTimeout: 750,
                    // Disable TypeScript features
                    typescript: {
                      suggest: { enabled: false },
                      validate: false,
                      format: { enabled: false }
                    },
                    javascript: {
                      suggest: { enabled: false },
                      validate: false,
                      format: { enabled: false }
                    }
                  }}
                  onMount={(editor) => {
                    editorRef.current = editor;
                  }}
                  beforeMount={(monaco) => {
                    // Completely disable TypeScript workers
                    monaco.languages.typescript.typescriptDefaults.setWorkerOptions({
                      customWorkerPath: undefined
                    });
                    monaco.languages.typescript.javascriptDefaults.setWorkerOptions({
                      customWorkerPath: undefined
                    });
                    
                    // Disable TypeScript language features
                    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
                      noSemanticValidation: true,
                      noSyntaxValidation: true
                    });
                    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
                      noSemanticValidation: true,
                      noSyntaxValidation: true
                    });
                  }}
                />
              </div>
            )}

            {activeTab === 'testcases' && (
              <div className="h-full p-4 overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Test Cases</h3>
                  <button
                    onClick={addTestCase}
                    className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm"
                  >
                    Add Test Case
                  </button>
                </div>

                {testCases.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">
                    <FileText className="w-12 h-12 mx-auto mb-4" />
                    <p>No test cases added yet.</p>
                    <p className="text-sm">Add test cases to run automated testing.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {testCases.map((testCase, index) => (
                      <div key={index} className="bg-gray-800 p-4 rounded border border-gray-700">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium">Test Case {index + 1}</h4>
                          <button
                            onClick={() => removeTestCase(index)}
                            className="text-red-400 hover:text-red-300"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium mb-2">Input</label>
                            <textarea
                              value={testCase.input}
                              onChange={(e) => updateTestCase(index, 'input', e.target.value)}
                              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
                              rows={3}
                              placeholder="Enter test input..."
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-2">Expected Output</label>
                            <textarea
                              value={testCase.expectedOutput}
                              onChange={(e) => updateTestCase(index, 'expectedOutput', e.target.value)}
                              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
                              rows={3}
                              placeholder="Enter expected output..."
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'output' && (
              <div className="h-full p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Output</h3>
                  <button
                    onClick={clearOutput}
                    className="text-gray-400 hover:text-white text-sm"
                  >
                    Clear
                  </button>
                </div>
                <pre className="bg-gray-800 p-4 rounded border border-gray-700 h-full overflow-y-auto text-sm font-mono">
                  {output || 'No output yet. Run your code to see results.'}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Input & Controls */}
        <div className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
          {/* Input Section */}
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold mb-3">Input</h3>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm h-32 resize-none"
              placeholder="Enter input for your program..."
            />
          </div>

          {/* Controls */}
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold mb-3">Controls</h3>
            <div className="space-y-3">
              <button
                onClick={executeCode}
                disabled={isExecuting || !backendConnected}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 px-4 py-2 rounded flex items-center justify-center"
              >
                <Play className="w-4 h-4 mr-2" />
                {isExecuting ? 'Running...' : 'Run Code'}
              </button>

              <button
                onClick={executeTestCases}
                disabled={isExecuting || testCases.length === 0 || !backendConnected}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-4 py-2 rounded flex items-center justify-center"
              >
                <Zap className="w-4 h-4 mr-2" />
                Run Test Cases
              </button>

              {isExecuting && (
                <button
                  onClick={stopExecution}
                  className="w-full bg-red-600 hover:bg-red-700 px-4 py-2 rounded flex items-center justify-center"
                >
                  <Square className="w-4 h-4 mr-2" />
                  Stop Execution
                </button>
              )}
            </div>
          </div>

          {/* File Operations */}
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-lg font-semibold mb-3">File Operations</h3>
            <div className="space-y-3">
              <button
                onClick={saveCode}
                className="w-full bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded flex items-center justify-center"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Code
              </button>

              <label className="w-full bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded flex items-center justify-center cursor-pointer">
                <Upload className="w-4 h-4 mr-2" />
                Load Code
                <input
                  type="file"
                  accept=".py,.js,.ts,.java,.cpp,.c,.cs,.go,.rs,.php,.rb,.swift,.kt,.scala,.sh"
                  onChange={loadCode}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Test Results Summary */}
          {testCaseSummary && (
            <div className="p-4 border-b border-gray-700">
              <h3 className="text-lg font-semibold mb-3">Test Results</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span>Total:</span>
                  <span className="font-medium">{testCaseSummary.total}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-green-400">Passed:</span>
                  <span className="font-medium text-green-400">{testCaseSummary.passed}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-red-400">Failed:</span>
                  <span className="font-medium text-red-400">{testCaseSummary.failed}</span>
                </div>
                <div className="mt-3 p-2 rounded text-center">
                  {testCaseSummary.allPassed ? (
                    <div className="text-green-400 flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 mr-2" />
                      All Tests Passed!
                    </div>
                  ) : (
                    <div className="text-red-400 flex items-center justify-center">
                      <XCircle className="w-5 h-5 mr-2" />
                      Some Tests Failed
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Execution Info */}
          {executionResult && (
            <div className="p-4">
              <h3 className="text-lg font-semibold mb-3">Execution Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Status:</span>
                  <span className={`font-medium ${
                    executionResult.status === 'completed' ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {executionResult.status.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Exit Code:</span>
                  <span className="font-medium">{executionResult.exitCode}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Duration:</span>
                  <span className="font-medium flex items-center">
                    <Clock className="w-4 h-4 mr-1" />
                    {executionResult.duration}ms
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnlineJudge; 