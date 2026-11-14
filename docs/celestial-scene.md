# Ночная обсерватория · 14.11.2026

При выпуске этой сцены версия интерфейса оставалась **V5.0.0**. Это обновление окружения и просмотра главной иллюстрации; коллекция и её схема не менялись.

## Изображения

| Роль | Оригинал | WebP для сайта | Размер |
|---|---|---|---|
| Главная, полный просмотр, открытка | `src/art/astrava-celestial-terrace.png` | `assets/art/astrava-celestial-terrace.webp` | 1774 × 887 |
| Общий фон | `src/art/astrava-celestial-palace.png` | `assets/art/astrava-celestial-palace.webp` | 1672 × 941 |

Оба PNG предоставлены владельцем. Перерисовка и изменение композиции не выполнялись. WebP: quality 93, method 6, исходные размеры. SHA256 оригиналов и производных файлов записаны в `assets/art/celestial-art.json`. Временные подписанные ссылки в код не включены.

`src/app.html` содержит WebP внутри `HERO_BLOOM_ART` и `--garden-image`, поэтому автономный HTML не загружает их из сети. `tools/mksite.py` проверяет совпадение встроенных байтов с локальными WebP и заменяет их путями файлов только в веб-сборках. Главный кадр предварительно загружается; изображения также копируются в Worker. Оригинальные PNG остаются в исходниках и исключены из Pages.

## Поведение

- `scene-layout-ready` включает полный кадр с отдельным текстом и диалогом `#heroSceneDialog`. Нативный `dialog` закрывается по Escape, кнопке и нажатию на подложку. Фокус возвращается к `#heroSceneOpen`.
- `celestial-edition` отключает движение и дублирующий слой `.sakura-bough` только у основной архитектурной сцены. Новые стили находятся в `addons/astral-studio/studio.css`.
- Внутренний ключ сцены **`sakura-garden` сохранён** для существующих настроек. В интерфейсе его подпись — «Ночная обсерватория». Другие сцены и собственные фотографии используют прежнюю логику.
- Под иллюстрацией остаются легенда и кнопка полного просмотра. На телефоне текст расположен ниже; тонирование и `cover`, обрезавшие лица, не применяются.

## Проверки

```sh
node --test --test-isolation=none tools/test/*.test.mjs site/test/*.test.mjs
NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules node tools/test/celestial.browser.cjs --require-celestial --screenshots
NODE_PATH=/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules node tools/test/journey.browser.cjs --screenshots
python3 tools/build-pages.py
```

Тест сцены проверяет фактические файлы и размеры, неподвижность дворца, отсутствие второго контура, адаптивность 1920/1440/390/320, диалог, PNG открытки, настройки после перезагрузки и неизменность коллекции. `--live` запускает тот же сценарий на опубликованном сайте. Сборка Pages дополнительно сверяет изображения с манифестом.
