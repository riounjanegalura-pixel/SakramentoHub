import { useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { FieldValues, UseFormReturn } from 'react-hook-form'
import { CircleAlert } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { TabAdvanceContext } from '../../features/booking/wizard/TabAdvance'
import { WizardContext } from '../../features/booking/wizard/WizardContext'

export interface SectionTab {
  id: string
  label: string
  content: ReactNode
  /** True while a field inside has a problem: the tab is marked and opens by itself so the field can take focus. */
  hasError?: boolean
  /**
   * Which of the step's answers belong to this tab (by key). Next checks only these before opening the next tab, so
   * a person is never shown a problem on a tab they have not reached yet.
   */
  owns?: (key: string) => boolean
}

/**
 * A long step split into tabs (panel: no one long scroll). Built on the shared Radix tabs. Every panel stays mounted
 * and only the active one is shown, so each field keeps its value and can still be found by validation.
 */
export function SectionTabs({ tabs, label, form }: { tabs: SectionTab[]; label: string; form?: UseFormReturn<FieldValues> | UseFormReturn<any> }) {
  const [value, setValue] = useState(tabs[0].id)
  const rootRef = useRef<HTMLDivElement>(null)

  // With a frame around us, its Next button opens the next tab (after checking this one) before going to another page.
  const tabAdvance = useContext(TabAdvanceContext)
  const wizard = useContext(WizardContext)
  // After Next opens a tab, its first field takes focus once the tab is showing.
  const focusNextTab = useRef(false)
  useEffect(() => {
    if (!focusNextTab.current) return
    focusNextTab.current = false
    rootRef.current?.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden]) :is(input, select, textarea):not([type="hidden"]):not([disabled])')?.focus()
  }, [value])
  const latest = useRef({ tabs, value, wizard })
  latest.current = { tabs, value, wizard }
  useEffect(() => {
    if (!tabAdvance || !form) return
    tabAdvance.set({
      advance: async () => {
        const { tabs: all, value: open, wizard: w } = latest.current
        const at = all.findIndex((t) => t.id === open)
        if (at < 0 || at >= all.length - 1) return false
        const shape = w?.definition.steps.find((s) => s.id === w.stepId)?.shape ?? {}
        const owns = all[at].owns
        const names = owns ? Object.keys(shape).filter(owns) : []
        const ok = names.length === 0 ? true : await form.trigger(names, { shouldFocus: false })
        if (ok) {
          const next = all[at + 1].id
          focusNextTab.current = true
          setValue(next)
        }
        return true
      },
    })
    return () => tabAdvance.set(null)
  }, [tabAdvance, form])
  // A tab that is only partly showing in the strip comes fully into view when it is selected (the strip scrolls, never the page).
  useEffect(() => {
    const selected = rootRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
    selected?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', container: 'nearest' } as ScrollIntoViewOptions)
  }, [value])

  const failing = tabs.filter((t) => t.hasError).map((t) => t.id)
  const failingKey = failing.join('|')
  const [seenKey, setSeenKey] = useState(failingKey)

  // When a problem appears in a tab that is not showing, show that tab in the same render, before focus moves to it.
  if (failingKey !== seenKey) {
    setSeenKey(failingKey)
    if (failing.length > 0 && !failing.includes(value)) setValue(failing[0])
  }

  return (
    <Tabs ref={rootRef} value={value} onValueChange={setValue} className="mb-4">
      <TabsList variant="line" aria-label={label} className="w-full justify-start overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <TabsTrigger key={t.id} value={t.id} aria-label={t.hasError ? `${t.label}, has a problem` : undefined} className="min-h-11 flex-none px-3 text-base">
            {t.label}
            {t.hasError && <CircleAlert aria-hidden="true" className="text-danger" />}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.id} value={t.id} forceMount hidden={t.id !== value} className="pt-3">
          {t.content}
        </TabsContent>
      ))}
    </Tabs>
  )
}
