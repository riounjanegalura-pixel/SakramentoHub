"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import * as React from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * sonner renders its region as aria-live="polite" but gives toasts no role, and
 * has no option for one. This sets the roles the spec asks for (section 10): the
 * region and each toast are a status, an error toast is an alert.
 */
function useToastRoles() {
  React.useEffect(() => {
    const apply = () => {
      document
        .querySelectorAll<HTMLElement>("section[aria-live] > .toaster")
        .forEach((list) => {
          list.parentElement?.setAttribute("role", "status")
        })
      // Toasts are <li> elements given a status or alert role, which a plain
      // list may not contain (axe rule "list"). The <ol> is only a wrapper, so
      // it is presentational and the toasts keep their own roles.
      document
        .querySelectorAll<HTMLElement>("ol[data-sonner-toaster]")
        .forEach((list) => {
          if (list.getAttribute("role") !== "presentation") list.setAttribute("role", "presentation")
        })
      document
        .querySelectorAll<HTMLElement>("[data-sonner-toast]")
        .forEach((toast) => {
          const role = toast.dataset.type === "error" ? "alert" : "status"
          if (toast.getAttribute("role") !== role) toast.setAttribute("role", role)
        })
    }
    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-type"],
    })
    return () => observer.disconnect()
  }, [])
}

const Toaster = ({ ...props }: ToasterProps) => {
  useToastRoles()
  return (
    <Sonner
      theme="light"
      position="top-center"
      closeButton
      duration={4500}
      visibleToasts={3}
      offset={16}
      mobileOffset={12}
      toastOptions={{
        classNames: {
          toast: "!rounded-xl !border !border-line !bg-surface !text-ink !shadow-lg !text-[15px] !font-medium !gap-3 !p-4",
          success: "!border-status-done-fg/40 [&_[data-icon]]:!text-status-done-fg",
          error: "!border-danger/40 [&_[data-icon]]:!text-danger",
          warning: "!border-navy/40",
          info: "!border-navy/40",
          closeButton: "!border-line !bg-surface !text-ink",
        },
      }}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-5" />,
        info: <InfoIcon className="size-5" />,
        warning: <TriangleAlertIcon className="size-5" />,
        error: <OctagonXIcon className="size-5" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--color-popover)",
          "--normal-text": "var(--color-popover-foreground)",
          "--normal-border": "var(--color-border)",
          "--border-radius": "0.5rem",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
