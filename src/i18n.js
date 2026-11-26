import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const modules = import.meta.glob('./localization/*.json', { eager: true });
const resources = {};
export const DEFAULT_LANGUAGE = 'zh-CN';

for (const path in modules) {
  const match = path.match(/\/([^/]+)\.json$/);
  if (match) {
    const lang = match[1];
    const moduleContent = modules[path].default || modules[path];
    resources[lang] = { translation: moduleContent };
  }
}

const savedLanguage = localStorage.getItem('app_lang');

i18n.on('languageChanged', (language) => {
  document.documentElement.lang = language === 'bd' ? 'bn-BD' : language;
  document.title = i18n.t('app_title', { lng: language });
});

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: Object.hasOwn(resources, savedLanguage) ? savedLanguage : DEFAULT_LANGUAGE,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
