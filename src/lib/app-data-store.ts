'use client';

import { create } from 'zustand';
import { getDocs, collection, Firestore } from 'firebase/firestore';
import type { Auth } from 'firebase/auth';
import { useCallback, useEffect, useMemo } from 'react';
import { useAuth, useFirestore, useUser } from '@/firebase';
import { apiClient } from '@/lib/api-client';

type ResourceName =
  | 'units'
  | 'bookings'
  | 'expenses'
  | 'booking-payments'
  | 'security-deposits'
  | 'reminders'
  | 'agents'
  | 'investors';

type ResourceContext = {
  auth?: Auth | null;
  firestore?: Firestore | null;
  userId?: string | null;
};

type ResourceMap = Partial<Record<ResourceName, any[]>>;
type FlagMap = Partial<Record<ResourceName, boolean>>;
type ErrorMap = Partial<Record<ResourceName, string | null>>;
type SourceMap = Partial<Record<ResourceName, 'firestore' | 'api'>>;

const TTL_MS = 5 * 60_000;

const RESOURCE_CONFIG: Record<ResourceName, { endpoint: string; firestoreCollections: string[] }> = {
  units: { endpoint: '/units', firestoreCollections: ['units'] },
  bookings: { endpoint: '/bookings', firestoreCollections: ['bookings'] },
  expenses: { endpoint: '/expenses', firestoreCollections: ['expenses'] },
  'booking-payments': { endpoint: '/booking-payments', firestoreCollections: ['bookingPayments', 'booking-payments', 'booking_payments'] },
  'security-deposits': { endpoint: '/security-deposits', firestoreCollections: ['securityDeposits', 'security-deposits', 'security_deposits'] },
  reminders: { endpoint: '/reminders', firestoreCollections: ['reminders'] },
  agents: { endpoint: '/agents', firestoreCollections: ['agents'] },
  investors: { endpoint: '/investors', firestoreCollections: ['investors'] },
};

async function tryReadFromFirestore(resource: ResourceName, firestore?: Firestore | null): Promise<any[] | null> {
  if (!firestore) return null;
  const config = RESOURCE_CONFIG[resource];

  for (const name of config.firestoreCollections) {
    try {
      const snapshot = await getDocs(collection(firestore, name));
      if (!snapshot.empty) {
        return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      }
    } catch {
      // Fallback to API below.
    }
  }

  return null;
}

function hasUsableData(value: unknown): value is any[] {
  return Array.isArray(value);
}

type StoreState = {
  data: ResourceMap;
  loading: FlagMap;
  backgroundLoading: FlagMap;
  errors: ErrorMap;
  loadedAt: Partial<Record<ResourceName, number>>;
  source: SourceMap;
  inflight: Partial<Record<ResourceName, Promise<void>>>;
  ensureResources: (resources: ResourceName[], ctx: ResourceContext, force?: boolean) => Promise<void>;
  invalidateResources: (resources: ResourceName[]) => void;
};

export const useAppDataStore = create<StoreState>((set, get) => ({
  data: {},
  loading: {},
  backgroundLoading: {},
  errors: {},
  loadedAt: {},
  source: {},
  inflight: {},
  ensureResources: async (resources, ctx, force = false) => {
    const tasks = resources.map(async (resource) => {
      const state = get();
      const loadedAt = state.loadedAt[resource] ?? 0;
      const freshEnough = !force && loadedAt > 0 && Date.now() - loadedAt < TTL_MS;
      if (freshEnough) return;

      const current = get().inflight[resource];
      if (current) return current;

      const hasCachedData = hasUsableData(get().data[resource]);
      const promise = (async () => {
        set((s) => ({
          loading: { ...s.loading, [resource]: !hasCachedData },
          backgroundLoading: { ...s.backgroundLoading, [resource]: hasCachedData },
          errors: { ...s.errors, [resource]: null },
        }));

        try {
          const firestoreData = await tryReadFromFirestore(resource, ctx.firestore);
          if (firestoreData) {
            set((s) => ({
              data: { ...s.data, [resource]: firestoreData },
              loading: { ...s.loading, [resource]: false },
              backgroundLoading: { ...s.backgroundLoading, [resource]: false },
              loadedAt: { ...s.loadedAt, [resource]: Date.now() },
              source: { ...s.source, [resource]: 'firestore' },
            }));
            return;
          }

          const apiData = await apiClient.get<any[]>(RESOURCE_CONFIG[resource].endpoint, ctx.auth ?? undefined);
          set((s) => ({
            data: { ...s.data, [resource]: Array.isArray(apiData) ? apiData : [] },
            loading: { ...s.loading, [resource]: false },
            backgroundLoading: { ...s.backgroundLoading, [resource]: false },
            loadedAt: { ...s.loadedAt, [resource]: Date.now() },
            source: { ...s.source, [resource]: 'api' },
          }));
        } catch (error: any) {
          set((s) => ({
            loading: { ...s.loading, [resource]: false },
            backgroundLoading: { ...s.backgroundLoading, [resource]: false },
            errors: { ...s.errors, [resource]: error?.message || `Failed to load ${resource}` },
          }));
        } finally {
          set((s) => {
            const nextInflight = { ...s.inflight };
            delete nextInflight[resource];
            return { inflight: nextInflight };
          });
        }
      })();

      set((s) => ({ inflight: { ...s.inflight, [resource]: promise } }));
      return promise;
    });

    await Promise.all(tasks);
  },
  invalidateResources: (resources) => {
    set((s) => {
      const loadedAt = { ...s.loadedAt };
      const errors = { ...s.errors };
      for (const resource of resources) {
        delete loadedAt[resource];
        delete errors[resource];
      }
      return { loadedAt, errors };
    });
  },
}));

type UseAppResourcesOptions = {
  preloadOnly?: boolean;
};

export function useAppResources(resources: ResourceName[], options?: UseAppResourcesOptions) {
  const auth = useAuth();
  const firestore = useFirestore();
  const { user } = useUser();
  const ensureResources = useAppDataStore((s) => s.ensureResources);
  const invalidateResources = useAppDataStore((s) => s.invalidateResources);
  const data = useAppDataStore((s) => s.data);
  const loadingMap = useAppDataStore((s) => s.loading);
  const backgroundLoadingMap = useAppDataStore((s) => s.backgroundLoading);
  const errorMap = useAppDataStore((s) => s.errors);

  const key = resources.join('|');

  useEffect(() => {
    if (!user) return;
    ensureResources(resources, { auth, firestore, userId: user.uid });
  }, [user?.uid, auth, firestore, key, ensureResources]);

  const refresh = useCallback(async (targetResources?: ResourceName[]) => {
    const list = targetResources ?? resources;
    invalidateResources(list);
    await ensureResources(list, { auth, firestore, userId: user?.uid }, true);
  }, [resources, invalidateResources, ensureResources, auth, firestore, user?.uid]);

  return useMemo(() => {
    const resourceData = Object.fromEntries(resources.map((resource) => [resource, data[resource] ?? []])) as Record<ResourceName, any[]>;
    const loading = resources.some((resource) => Boolean(loadingMap[resource]) && !hasUsableData(data[resource]));
    const backgroundLoading = resources.some((resource) => Boolean(backgroundLoadingMap[resource]));
    const errors = resources
      .map((resource) => errorMap[resource])
      .filter(Boolean)
      .join('\n');

    return {
      data: resourceData,
      loading: options?.preloadOnly ? false : loading,
      backgroundLoading,
      error: errors || null,
      refresh,
      invalidate: invalidateResources,
    };
  }, [resources, data, loadingMap, backgroundLoadingMap, errorMap, invalidateResources, refresh, options?.preloadOnly]);
}
