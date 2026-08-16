import { createContext, useContext } from 'react'
import type { EditorHandle } from './formatCommands'

/** 当前活动编辑器句柄；工具栏与快捷键经此转发命令 */
export const EditorCtx = createContext<EditorHandle | null>(null)

export const useEditor = () => useContext(EditorCtx)
