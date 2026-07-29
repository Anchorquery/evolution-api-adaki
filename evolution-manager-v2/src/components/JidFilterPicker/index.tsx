import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";

import { Badge } from "@evoapi/design-system/badge";
import { Button } from "@evoapi/design-system/button";
import { Input } from "@/components/ui/input";

import { useFetchAllGroups } from "@/lib/queries/group/fetchAllGroups";
import { useFetchAllNewsletters } from "@/lib/queries/newsletter/fetchAllNewsletters";
import { useFindChats } from "@/lib/queries/chat/findChats";
import { useSyncNewsletterConversation } from "@/lib/queries/chatwoot/syncNewsletterConversation";

type Category = "groups" | "newsletters" | "chats";

interface JidOption {
  value: string;
  label: string;
  category: Category;
}

interface JidFilterPickerProps {
  instanceName?: string;
  values: string[];
  onValuesChange: (values: string[]) => void;
  // Si el filtro de privacidad esta en "Todos", tildar no tiene ningun efecto
  // — el picker igual queda visible (para el boton "Crear en Chatwoot" de
  // Canales), pero sin checkboxes ni controles de seleccion.
  selectable?: boolean;
}

const CATEGORY_LABEL: Record<Category, string> = {
  groups: "Grupos",
  newsletters: "Canales",
  chats: "Contactos/Chats",
};

const CATEGORY_SUFFIX: Record<"groups" | "newsletters", string> = {
  groups: "@g.us",
  newsletters: "@newsletter",
};

const categoryOf = (jid: string): Category => {
  if (jid.endsWith("@g.us")) return "groups";
  if (jid.endsWith("@newsletter")) return "newsletters";
  return "chats";
};

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

function useDebouncedValue(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function JidFilterPicker({ instanceName, values, onValuesChange, selectable = true }: JidFilterPickerProps) {
  const [tab, setTab] = useState<Category>("groups");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);

  // Grupos y canales: WhatsApp los devuelve completos en una sola llamada, no
  // hay forma (ni necesidad) de paginarlos server-side.
  const [localSearch, setLocalSearch] = useState("");
  const [localVisibleCount, setLocalVisibleCount] = useState(PAGE_SIZE);
  const { data: groups, isLoading: groupsLoading } = useFetchAllGroups({ instanceName });
  const { data: newsletters, isLoading: newslettersLoading } = useFetchAllNewsletters({ instanceName });

  // Contactos/chats: con miles de registros no se puede traer todo de una,
  // busqueda y paginado corren contra el backend (ver fetchChats + pushName).
  const [chatSearchInput, setChatSearchInput] = useState("");
  const chatSearch = useDebouncedValue(chatSearchInput, SEARCH_DEBOUNCE_MS);
  const [chatTake, setChatTake] = useState(PAGE_SIZE);
  useEffect(() => {
    setChatTake(PAGE_SIZE);
  }, [chatSearch]);
  const {
    data: chatsRaw,
    isLoading: chatsLoading,
    isFetching: chatsFetching,
  } = useFindChats({ instanceName, search: chatSearch || undefined, take: chatTake, skip: 0 });

  useEffect(() => {
    setLocalVisibleCount(PAGE_SIZE);
  }, [tab, localSearch]);

  useEffect(() => {
    if (!selectable) setShowSelectedOnly(false);
  }, [selectable]);

  const groupOptions = useMemo<JidOption[]>(
    () => (groups || []).map((g) => ({ value: g.id, label: g.subject || g.id, category: "groups" as const })),
    [groups],
  );
  const newsletterOptions = useMemo<JidOption[]>(
    () => (newsletters || []).map((n) => ({ value: n.id, label: n.name || n.id, category: "newsletters" as const })),
    [newsletters],
  );
  const chatOptions = useMemo<JidOption[]>(
    () =>
      (chatsRaw || [])
        .filter((c) => c.remoteJid && !c.remoteJid.endsWith("@g.us") && !c.remoteJid.endsWith("@newsletter"))
        .map((c) => ({ value: c.remoteJid, label: c.pushName || c.remoteJid.split("@")[0], category: "chats" as const })),
    [chatsRaw],
  );

  // Cache de labels que sobrevive a busquedas, paginado y cambios de pestaña,
  // para poder mostrar nombres reales en "ver solo seleccionados" y en los
  // chips de arriba aunque el item ya no este en la pagina cargada.
  const [labelCache, setLabelCache] = useState<Record<string, string>>({});
  useEffect(() => {
    const incoming = [...groupOptions, ...newsletterOptions, ...chatOptions];
    if (incoming.length === 0) return;
    setLabelCache((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const o of incoming) {
        if (next[o.value] !== o.label) {
          next[o.value] = o.label;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [groupOptions, newsletterOptions, chatOptions]);

  const countInTab = (category: Category) =>
    values.filter((v) => (category === "chats" ? categoryOf(v) === "chats" : v.endsWith(CATEGORY_SUFFIX[category]))).length;

  const toggleValue = (value: string) => {
    onValuesChange(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);
  };

  const clearTabSelection = () => {
    onValuesChange(values.filter((v) => categoryOf(v) !== tab));
  };

  let visibleOptions: JidOption[];
  let isLoadingTab: boolean;
  let hasMore = false;
  let totalKnownInTab: number | null = null;

  if (showSelectedOnly) {
    const selectedInTab = values.filter((v) => categoryOf(v) === tab);
    visibleOptions = selectedInTab.map((v) => ({ value: v, label: labelCache[v] ?? v, category: tab }));
    isLoadingTab = false;
  } else if (tab === "chats") {
    visibleOptions = chatOptions; // busqueda y paginado ya vienen filtrados del backend
    isLoadingTab = chatsLoading;
    hasMore = chatOptions.length === chatTake;
  } else {
    const source = tab === "groups" ? groupOptions : newsletterOptions;
    totalKnownInTab = source.length;
    const term = localSearch.trim().toLowerCase();
    const filtered = term ? source.filter((o) => o.label.toLowerCase().includes(term) || o.value.toLowerCase().includes(term)) : source;
    visibleOptions = filtered.slice(0, localVisibleCount);
    isLoadingTab = tab === "groups" ? groupsLoading : newslettersLoading;
    hasMore = filtered.length > visibleOptions.length;
  }

  const selectAllVisible = () => {
    const toAdd = visibleOptions.map((o) => o.value).filter((v) => !values.includes(v));
    onValuesChange([...values, ...toAdd]);
  };

  // Un canal seguido no aparece solo como conversacion en Chatwoot (WhatsApp no
  // manda trafico 1:1 para canales) — este botón lo crea a demanda para poder
  // mandarle mensajes/campañas desde ahí.
  const { syncNewsletterConversation } = useSyncNewsletterConversation();
  const [syncingJid, setSyncingJid] = useState<string | null>(null);
  const [syncedJids, setSyncedJids] = useState<Set<string>>(new Set());

  const handleSyncNewsletter = async (jid: string, name: string) => {
    if (!instanceName) return;
    setSyncingJid(jid);
    try {
      await syncNewsletterConversation({ instanceName, jid, name });
      setSyncedJids((prev) => new Set(prev).add(jid));
      toast.success("Conversación creada en Chatwoot. Ya podés mandarle mensajes o incluirla en una campaña.");
    } catch {
      toast.error("No se pudo crear la conversación en Chatwoot para este canal.");
    } finally {
      setSyncingJid(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(CATEGORY_LABEL) as Category[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setTab(c)}
            className={`rounded-md px-3 py-1 text-sm transition-colors ${
              tab === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
            {CATEGORY_LABEL[c]}
            {selectable && countInTab(c) > 0 && <span className="ml-1.5 rounded-full bg-background/40 px-1.5 text-xs">{countInTab(c)}</span>}
          </button>
        ))}
      </div>

      {selectable && values.length > 0 && (
        <div className="flex flex-wrap gap-1 rounded-lg border border-muted bg-background p-2">
          {values.map((v) => (
            <Badge key={v} variant="secondary" className="flex items-center gap-1 rounded-xl px-2">
              <span className="max-w-48 truncate text-xs">{labelCache[v] ?? v}</span>
              <button type="button" aria-label={`Quitar ${labelCache[v] ?? v}`} onClick={() => toggleValue(v)}>
                <span className="text-xs opacity-70 hover:opacity-100">×</span>
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          className="flex-1"
          placeholder={`Buscar en ${CATEGORY_LABEL[tab].toLowerCase()}...`}
          value={tab === "chats" ? chatSearchInput : localSearch}
          onChange={(e) => (tab === "chats" ? setChatSearchInput(e.target.value) : setLocalSearch(e.target.value))}
          disabled={showSelectedOnly}
        />
        {selectable && (
          <Button
            type="button"
            variant={showSelectedOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setShowSelectedOnly((v) => !v)}
            disabled={countInTab(tab) === 0 && !showSelectedOnly}>
            Ver solo seleccionados
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {selectable
            ? `${countInTab(tab)} seleccionados en ${CATEGORY_LABEL[tab].toLowerCase()}${totalKnownInTab !== null && !showSelectedOnly ? ` de ${totalKnownInTab}` : ""}`
            : `${CATEGORY_LABEL[tab]}${totalKnownInTab !== null ? ` (${totalKnownInTab})` : ""}`}
          {chatsFetching && tab === "chats" && !showSelectedOnly ? " · buscando..." : ""}
        </span>
        {selectable && !showSelectedOnly && (
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={selectAllVisible} disabled={visibleOptions.length === 0}>
              Seleccionar visibles
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={clearTabSelection} disabled={countInTab(tab) === 0}>
              Limpiar
            </Button>
          </div>
        )}
      </div>

      <div className="scrollbar-thin scrollbar-track-transparent scrollbar-thumb-muted-foreground dark:scrollbar-thumb-muted scrollbar-thumb-rounded-lg max-h-72 overflow-y-auto rounded-md border border-muted bg-background p-1">
        {isLoadingTab ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Cargando {CATEGORY_LABEL[tab].toLowerCase()}...</div>
        ) : visibleOptions.length === 0 ? (
          <EmptyState category={tab} showSelectedOnly={showSelectedOnly} searching={tab === "chats" ? !!chatSearch : !!localSearch.trim()} />
        ) : (
          <>
            {visibleOptions.map((option) => (
              <div key={option.value} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted">
                {selectable ? (
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={values.includes(option.value)} onChange={() => toggleValue(option.value)} className="h-4 w-4 shrink-0" />
                    <span className="truncate">{option.label}</span>
                  </label>
                ) : (
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                )}
                {option.category === "newsletters" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 shrink-0 px-2 text-xs"
                    disabled={syncingJid === option.value || syncedJids.has(option.value)}
                    onClick={() => handleSyncNewsletter(option.value, option.label)}>
                    {syncedJids.has(option.value) ? "En Chatwoot ✓" : syncingJid === option.value ? "Creando..." : "Crear en Chatwoot"}
                  </Button>
                )}
              </div>
            ))}
            {!showSelectedOnly && hasMore && (
              <div className="p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => (tab === "chats" ? setChatTake((t) => t + PAGE_SIZE) : setLocalVisibleCount((c) => c + PAGE_SIZE))}>
                  Cargar más
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ category, showSelectedOnly, searching }: { category: Category; showSelectedOnly: boolean; searching: boolean }) {
  if (showSelectedOnly) {
    return <div className="p-4 text-center text-sm text-muted-foreground">No hay nada seleccionado en {CATEGORY_LABEL[category].toLowerCase()}.</div>;
  }

  if (searching) {
    return <div className="p-4 text-center text-sm text-muted-foreground">Sin resultados para tu búsqueda.</div>;
  }

  if (category === "newsletters") {
    return (
      <div className="space-y-1 p-4 text-center text-sm text-muted-foreground">
        <p>No hay canales sincronizados todavía.</p>
        <p className="text-xs">
          WhatsApp no expone una lista de canales seguidos: solo aparecen acá los canales que ya siguió esta instancia (recién seguidos o con
          actividad reciente). Seguí el canal desde su link de invitación en la pestaña Canales de la instancia.
        </p>
      </div>
    );
  }

  return <div className="p-4 text-center text-sm text-muted-foreground">Sin {CATEGORY_LABEL[category].toLowerCase()} disponibles.</div>;
}
