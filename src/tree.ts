import type { ClickUp } from './clickup-api'
import type { Deadline } from './deadline'

export type TreeChild =
  | { kind: 'team'; id: string; name: string }
  | { kind: 'space'; id: string; name: string }
  | { kind: 'folder'; id: string; name: string }
  | { kind: 'list'; id: string; name: string; taskCount: number }

export type TreeNode = { kind: 'root' | 'team' | 'space' | 'folder'; id?: string }

type IdName = { id: string; name: string }
type ListRecord = IdName & { task_count?: number | string }

export async function treeChildren(api: ClickUp, node: TreeNode, deadline: Deadline): Promise<TreeChild[]> {
  if (node.kind === 'root') {
    const body = (await api.get('/team', deadline)) as { teams?: IdName[] }
    return (body.teams ?? []).map((team) => ({ kind: 'team' as const, id: team.id, name: team.name }))
  }
  if (node.kind === 'team') {
    const body = (await api.get(`/team/${node.id}/space`, deadline)) as { spaces?: IdName[] }
    return (body.spaces ?? []).map((space) => ({ kind: 'space' as const, id: space.id, name: space.name }))
  }
  if (node.kind === 'space') {
    const foldersBody = (await api.get(`/space/${node.id}/folder`, deadline)) as { folders?: IdName[] }
    const listsBody = (await api.get(`/space/${node.id}/list`, deadline)) as { lists?: ListRecord[] }
    const folders = (foldersBody.folders ?? []).map((folder) => ({ kind: 'folder' as const, id: folder.id, name: folder.name }))
    const lists = (listsBody.lists ?? []).map(toListChild)
    return [...folders, ...lists]
  }
  const body = (await api.get(`/folder/${node.id}/list`, deadline)) as { lists?: ListRecord[] }
  return (body.lists ?? []).map(toListChild)
}

function toListChild(list: ListRecord): TreeChild {
  return { kind: 'list', id: list.id, name: list.name, taskCount: Number(list.task_count ?? 0) }
}
