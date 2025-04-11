const fs = require('fs');
const KMeans = require('kmeans-js');

const data = JSON.parse(fs.readFileSync('./logs/results_grid_search.json', 'utf8'));
let allConfigs = [];
for (const tf in data) {
    allConfigs = allConfigs.concat(data[tf]);
}

const vectors = allConfigs.map(config => [
    config.totalProfit,
    config.maxDrawdown,
    config.winRate * 100,
    config.trades,
    config.emaFast,
    config.emaSlow,
    ...config.macd.split('/').map(Number),
    config.adxPeriod,
    config.adxThreshold,
    Number(config.rr.split(':')[1])
]);

const kmeans = new KMeans();
kmeans.cluster(vectors, 5); // 5 cluster
console.log('Centroidi dei cluster:', kmeans.centroids);

// Assegna ogni configurazione al suo cluster usando kmeans.clusters
const clusteredConfigs = allConfigs.map((config, i) => ({
    ...config,
    cluster: kmeans.clusters[i] // Qui il fix!
}));

fs.writeFileSync('./logs/clustered_configs.json', JSON.stringify(clusteredConfigs, null, 2));
console.log('Risultati salvati in clustered_configs.json');