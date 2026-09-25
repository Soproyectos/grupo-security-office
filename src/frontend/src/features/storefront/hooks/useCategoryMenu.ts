import { useEffect, useSyncExternalStore } from 'react'
import { fetchCategoryMenu } from '../../../services/public-catalog.service'
import type { CategoryMenuStatus, MenuCategory } from '../types/categoryMenu'

export interface CategoryMenuState {
  status: CategoryMenuStatus
  categories: MenuCategory[]
  retry: () => void
}

interface CategoryMenuSnapshot {
  status: CategoryMenuStatus
  categories: MenuCategory[]
}

const NO_CATEGORIES: MenuCategory[] = []

/**
 * Module-scoped cache: the menu is session-wide, so the header, the mobile
 * drawer and the category page share a single request. Only success is cached;
 * an error stays available so `retry()` can run it again.
 */
let snapshot: CategoryMenuSnapshot = { status: 'loading', categories: NO_CATEGORIES }
let pending: Promise<void> | null = null
let requestId = 0
const listeners = new Set<() => void>()

function publish(next: CategoryMenuSnapshot): void {
  snapshot = next
  for (const listener of [...listeners]) listener()
}

export function getCategoryMenuSnapshot(): CategoryMenuSnapshot {
  return snapshot
}

export function subscribeCategoryMenu(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Starts a request without deduplicating it. `requestId` keeps a stale response
 * (e.g. when `retry()` is pressed while a request is in flight) from overwriting
 * the state of the current attempt.
 */
function startLoad(): Promise<void> {
  const id = ++requestId
  publish({ status: 'loading', categories: NO_CATEGORIES })

  const request: Promise<void> = fetchCategoryMenu()
    .then((categories) => {
      if (id === requestId) publish({ status: 'ready', categories })
    })
    .catch(() => {
      if (id === requestId) publish({ status: 'error', categories: NO_CATEGORIES })
    })
    .then(() => {
      if (id === requestId) pending = null
    })

  pending = request
  return request
}

/** Loads the tree once per session; cached data is never refetched. */
export function loadCategoryMenu(): Promise<void> {
  if (snapshot.status === 'ready') return Promise.resolve()
  if (pending) return pending
  return startLoad()
}

/** Drops whatever is cached (including the error state) and loads again. */
export function retryCategoryMenu(): void {
  void startLoad()
}

export function useCategoryMenu(): CategoryMenuState {
  const current = useSyncExternalStore(subscribeCategoryMenu, getCategoryMenuSnapshot, getCategoryMenuSnapshot)

  useEffect(() => {
    void loadCategoryMenu()
  }, [])

  return { status: current.status, categories: current.categories, retry: retryCategoryMenu }
}
