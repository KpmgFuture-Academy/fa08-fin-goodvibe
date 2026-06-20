"use client";

/**
 * chief-cache — 이장님 4탭 공용 클라이언트 캐시 (의존성 0, 커스텀).
 *
 * 목적:
 *  - 접속 시 4페이지 데이터를 미리 받아두고(prefetch),
 *  - 탭을 옮겼다 돌아와도 캐시에서 "즉시" 보여준다(깜빡임 없이 — 훅이 캐시를 동기 반환).
 *  - 공유 호출(todo-status 등)은 한 번만 → 백엔드 호출 수도 절감.
 *
 * 동작:
 *  - 모듈 레벨 Map 스토어라 클라이언트 네비게이션 사이에서 유지된다(컴포넌트 unmount 무관).
 *  - useCachedResource: useSyncExternalStore 로 키를 구독. 캐시에 신선한 데이터가 있으면
 *    첫 렌더에서 그대로 반환(=리로드/깜빡임 없음). 없거나 stale 이면 mount 시 fetch.
 *  - invalidate: 변경(쓰기) 후 해당 키를 새로고침. 마운트된 화면은 옛 데이터를 유지한 채 갱신.
 *  - 실패해도 죽지 않음(이전 데이터 유지 + error 표기).
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

type Fetcher = () => Promise<unknown>;
type Entry = {
  data?: unknown;
  error?: unknown;
  ts: number;
  promise?: Promise<unknown>;
  fetcher?: Fetcher;
};

const DEFAULT_TTL = 60_000; // 1분: 이 시간 내 재요청은 캐시로 처리

const store = new Map<string, Entry>();
const listeners = new Map<string, Set<() => void>>();

function emit(key: string) {
  const ls = listeners.get(key);
  if (ls) ls.forEach((cb) => cb());
}

function subscribe(key: string, cb: () => void) {
  let ls = listeners.get(key);
  if (!ls) {
    ls = new Set();
    listeners.set(key, ls);
  }
  ls.add(cb);
  return () => {
    ls!.delete(cb);
    if (ls!.size === 0) listeners.delete(key);
  };
}

/** key 의 데이터를 보장(캐시 hit 면 즉시, 아니면 fetch). 중복 호출은 1개로 합침. */
export function loadResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts?: { ttl?: number; force?: boolean },
): Promise<T> {
  const ttl = opts?.ttl ?? DEFAULT_TTL;
  const cur = store.get(key);
  const now = Date.now();
  if (!opts?.force && cur) {
    if (cur.promise) return cur.promise as Promise<T>; // 진행 중 → 중복 제거
    if (cur.error === undefined && cur.data !== undefined && now - cur.ts < ttl) {
      return Promise.resolve(cur.data as T); // 신선 → 캐시
    }
  }
  const p = Promise.resolve()
    .then(fetcher)
    .then(
      (data) => {
        store.set(key, { data, ts: Date.now(), fetcher: fetcher as Fetcher });
        emit(key);
        return data;
      },
      (error) => {
        const prev = store.get(key);
        store.set(key, { data: prev?.data, error, ts: Date.now(), fetcher: fetcher as Fetcher });
        emit(key);
        throw error;
      },
    );
  // 진행 중 상태 기록(기존 data 는 유지 → force 새로고침 중에도 옛 데이터 표시).
  store.set(key, { ...(cur ?? { ts: 0 }), fetcher: fetcher as Fetcher, promise: p });
  emit(key);
  return p as Promise<T>;
}

/** 화면에 쓰지 않고 미리 받아만 둔다(접속 시 4페이지 워밍업). 실패해도 조용히 무시. */
export function prefetch<T>(key: string, fetcher: () => Promise<T>, opts?: { ttl?: number }) {
  void loadResource(key, fetcher, opts).catch(() => {});
}

/** key(또는 prefix) 무효화 → 마운트된 화면은 force 새로고침, 아니면 삭제(다음 방문 시 재요청). */
export function invalidate(prefix: string) {
  for (const key of Array.from(store.keys())) {
    if (key !== prefix && !key.startsWith(prefix)) continue;
    const entry = store.get(key);
    const mounted = (listeners.get(key)?.size ?? 0) > 0;
    if (mounted && entry?.fetcher) {
      void loadResource(key, entry.fetcher, { force: true }).catch(() => {});
    } else {
      store.delete(key);
      emit(key);
    }
  }
}

export interface CachedResource<T> {
  data: T | undefined;
  loading: boolean;
  error: unknown;
  refresh: () => void;
}

/** 캐시된 리소스를 구독. 캐시 hit 면 첫 렌더부터 data 가 채워져 깜빡임이 없다. */
export function useCachedResource<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  opts?: { ttl?: number; enabled?: boolean },
): CachedResource<T> {
  const enabled = (opts?.enabled ?? true) && !!key;
  const k = key ?? "";
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const entry = useSyncExternalStore<Entry | undefined>(
    (cb) => (enabled ? subscribe(k, cb) : () => {}),
    () => (enabled ? store.get(k) : undefined),
    () => undefined, // SSR: 항상 미로딩으로 시작 → 하이드레이션 일치
  );

  useEffect(() => {
    if (!enabled) return;
    void loadResource(k, () => fetcherRef.current(), { ttl: opts?.ttl }).catch(() => {});
    // 의존: 키/활성화. 무효화 후 갱신은 invalidate() 가 force 재호출로 처리.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, enabled]);

  const refresh = useCallback(() => {
    if (enabled) void loadResource(k, () => fetcherRef.current(), { force: true }).catch(() => {});
  }, [k, enabled]);

  return {
    data: entry?.data as T | undefined,
    loading: enabled && (!entry || (entry.data === undefined && entry.error === undefined)),
    error: entry?.error,
    refresh,
  };
}
