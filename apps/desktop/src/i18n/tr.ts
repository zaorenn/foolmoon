// health: allow FILE_LINES -- modular Turkish locale assembler
import { defineLocale, type TranslationOverrides } from './define-locale'
import { introTr } from './intro-tr'
import { trAssistantAndTail } from './tr_assistant_and_tail'
import { trBillingBlock } from './tr_billing_and_host'
import { trBoot } from './tr_boot'
import { trCapabilities } from './tr_capabilities'
import { trCatalog } from './tr_catalog'
import { trChatAndSidebar } from './tr_chat_and_sidebar'
import { trChromeCore } from './tr_chrome_core'
import { trCommandCenter } from './tr_command_center'
import { trConnectors, trConnectorsPage, trSessionImport } from './tr_connectors'
import { trAppTour, trExternalOpenFailed, trGatewayGroupOpen, trSkillDeepLink } from './tr_deep_links'
import { trFirstRun } from './tr_first_run'
import { trNotices } from './tr_notices'
import { trSharedMetrics } from './tr_notifications'
import { trOnboarding } from './tr_onboarding'
import { trFieldDescriptions, trFieldLabels } from './tr_settings_fields'
import { trSettingsGatewayBilling } from './tr_settings_gateway_billing'
import { trSettingsMain } from './tr_settings_main'
import { trShellAndZones } from './tr_shell_and_zones'
import type { Translations } from './types'

export const trOverrides: Translations = {
  gatewayGroupOpen: trGatewayGroupOpen,
  sharedMetrics: trSharedMetrics,
  firstRun: trFirstRun,
  intro: introTr,
  connectors: trConnectors,
  connectorsPage: trConnectorsPage,
  sessionImport: trSessionImport,
  catalog: trCatalog,
  skillDeepLink: trSkillDeepLink,
  appTour: trAppTour,
  externalOpenFailed: trExternalOpenFailed,
  onboarding: trOnboarding,
  ...trNotices,
  ...trBoot,
  ...trBillingBlock,
  ...trChromeCore,
  settings: {
    ...trSettingsMain,
    ...trSettingsGatewayBilling,
    fieldLabels: trFieldLabels,
    fieldDescriptions: trFieldDescriptions
  },
  ...trCapabilities,
  ...trCommandCenter,
  ...trChatAndSidebar,
  ...trShellAndZones,
  ...trAssistantAndTail
} satisfies TranslationOverrides

export const tr = defineLocale(trOverrides)
