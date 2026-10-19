// Bausteine des Bedienfelds (Einstellungen, Für Entwickler): Zeile mit Wert und ›, Schalter, Gruppe.
// Aus Einstellungen.tsx herausgezogen (2026-10-19), damit beide Seiten gleich aussehen.
import type {Component, JSX} from 'solid-js'
import {Show} from 'solid-js'
import {A} from '@solidjs/router'

import './roehren.css'

export const Pfeil: Component = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M9 5l7 7-7 7" />
  </svg>
)

export type ZeileProps = {
  label: string
  wert?: JSX.Element
  unter?: string
  href?: string
  onClick?: () => void
  gefahr?: boolean
}
// eine Zeile: links Beschriftung (Drahtschrift), rechts Wert in mattem Orange mit ›
export const Zeile: Component<ZeileProps> = props => {
  const innen = (
    <>
      <span>
        <span class="sl">{props.label}</span>
        <Show when={props.unter}>
          <span class="s">{props.unter}</span>
        </Show>
      </span>
      <span class="val">
        {props.wert}
        <Pfeil />
      </span>
    </>
  )
  return (
    <Show
      when={props.href}
      fallback={
        <button
          type="button"
          class="rz-setting"
          classList={{gefahr: props.gefahr}}
          onClick={() => props.onClick?.()}
        >
          {innen}
        </button>
      }
    >
      <A
        href={props.href!}
        class="rz-setting"
        classList={{gefahr: props.gefahr}}
      >
        {innen}
      </A>
    </Show>
  )
}

export const Schalter: Component<{
  label: string
  an: boolean
  unter?: string
  onClick: () => void
}> = props => (
  <button
    type="button"
    class="rz-setting"
    role="switch"
    aria-checked={props.an}
    onClick={() => props.onClick()}
  >
    <span>
      <span class="sl">{props.label}</span>
      <Show when={props.unter}>
        <span class="s">{props.unter}</span>
      </Show>
    </span>
    <span class="rz-switch" classList={{on: props.an}} />
  </button>
)

export const Gruppe: Component<{
  titel: string
  children: JSX.Element
}> = props => (
  <div class="rz-gruppe">
    <span class="rz-eyebrow">{props.titel}</span>
    {props.children}
  </div>
)
