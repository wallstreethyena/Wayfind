# Wayfind AI Workspace Setup

## Purpose

This document describes the local AI development environment used for Wayfind.

The goal is to maintain a reliable, persistent workspace for:
- Claude Code orchestration
- Local Ollama models
- Multi-agent workflows
- Long-running development tasks

---

# Terminal Architecture

Wayfind development uses tmux for persistent sessions.

Benefits:

- Sessions survive terminal closure
- Long-running AI tasks continue running
- Multiple workflows can run simultaneously

## Current tmux workspace

Main session:

wayfind

Example panes:

claude        Claude Code session
git           Git operations
monitor       System monitoring
zsh           General terminal
claude.exe    Additional Claude process

Useful commands:

List sessions:

tmux ls

Restore workspace:

tmux attach -t wayfind

Only create a new session if the existing workspace is unavailable.

Avoid duplicate Claude sessions working on the same files.

---

# Local AI Models

Wayfind uses Ollama for local model workloads.

Installed models:

## qwen2.5-coder:14b

Purpose:
- Code assistance
- Refactoring
- Debugging
- Tests

## llama3.1:8b

Purpose:
- Editorial drafts
- SEO content
- Marketing copy
- Social content

## deepseek-r1:14b

Purpose:
- Reasoning
- Strategy analysis
- Root-cause investigation

---

# AI Responsibility Model

Claude:
- Architecture
- Final decisions
- Tradeoffs
- Quality control

Local models:
- Repetitive work
- Drafting
- Exploration
- Lower-cost workloads

---

# Git Safety Rules

Before major commands verify:

```bash
git status
git branch --show-current
pwd


# Worktree Awareness

Before editing code:

```bash
pwd
git branch --show-current

---

# Session Recovery

If Terminal closes:

1. Open Terminal
2. Run:

tmux ls

3. Restore:

tmux attach -t wayfind

Do not create duplicate Claude sessions unless the existing workspace is unavailable.

Avoid multiple agents editing the same files without coordination.

---

# Development Philosophy

Use:

Claude for:
- Architecture
- Judgment
- Final decisions

Local models for:
- Drafting
- Exploration
- Repetitive workloads

Prefer:

- Validation over assumptions
- Small changes over large rewrites
- Clear ownership over overlapping responsibilities
