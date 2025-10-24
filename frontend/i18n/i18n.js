// i18n (internationalization) manager
class I18n {
    constructor() {
        // Get saved language or default to browser language
        const savedLang = localStorage.getItem('language');
        const browserLang = navigator.language.split('-')[0]; // 'en-US' -> 'en'
        
        // Default to English if browser language not supported
        this.currentLanguage = savedLang || (browserLang === 'zh' ? 'zh' : 'en');
        this.translations = this.currentLanguage === 'zh' ? translations_zh : translations_en;
    }
    
    // Get translation by key
    t(key) {
        return this.translations[key] || key;
    }
    
    // Change language
    setLanguage(lang) {
        this.currentLanguage = lang;
        this.translations = lang === 'zh' ? translations_zh : translations_en;
        localStorage.setItem('language', lang);
        
        // Trigger UI update
        this.updateUI();
    }
    
    // Get current language
    getCurrentLanguage() {
        return this.currentLanguage;
    }
    
    // Update all UI elements with data-i18n attribute
    updateUI() {
        // Handle data-i18n (text content)
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = this.t(key);
            
            // Update text content (not for inputs)
            if (element.tagName !== 'INPUT' && element.tagName !== 'TEXTAREA') {
                element.textContent = translation;
            }
        });
        
        // Handle data-i18n-placeholder (placeholder attribute)
        document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            const translation = this.t(key);
            element.placeholder = translation;
        });
        
        // Update title
        document.title = this.t('title');
        
        // Update metrics if they exist (they are dynamically generated)
        const metricLabels = document.querySelectorAll('.metric-label');
        if (metricLabels.length > 0 && window.viewer && window.viewer.currentData) {
            // Re-render metrics with new language
            window.viewer.updateMetrics(window.viewer.currentData);
        }
        
        // Trigger custom event for components that need manual update
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: this.currentLanguage } }));
    }
}

// Create global i18n instance
const i18n = new I18n();
