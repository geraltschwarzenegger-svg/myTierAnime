# Карта ASTRAVA

[Открыть интерактивную карту](https://geraltschwarzenegger-svg.github.io/myTierAnime/docs/architecture/) · [Данные графа](graph.json) · [Отчёт Graphify](GRAPH_REPORT.md)

Выбери подсистему или введи имя функции. Стрелки показывают направление связи. Из списка связей можно перейти к следующей функции, а из карточки узла — к исходной строке на GitHub. Весь граф доступен отдельной кнопкой.

Карта хранит SHA проанализированного коммита. Graphify извлекает связи из JavaScript и Python. Пунктирные связи добавлены эвристически и скрыты по умолчанию. Встроенный JavaScript сохраняет номера строк исходного HTML. Стили, данные коллекции, медиа и готовые сборки находятся за пределами этого графа.

## Пересборка

Установи официальный Graphify 0.9.115 в отдельной среде и запусти команду из корня проекта. Она берёт исходники из выбранного коммита.

```bash
python3 tools/build-architecture.py --graphify /path/to/graphify --revision HEAD
```

Сборщик проверяет SHA-384 библиотеки vis-network и встраивает её в HTML. Карта рисуется локально в браузере. Для переходов к исходникам нужен доступ к GitHub. [Graphify](https://github.com/Graphify-Labs/graphify) · [Лицензии vis-network](https://github.com/visjs/vis-network/tree/v9.1.6)
