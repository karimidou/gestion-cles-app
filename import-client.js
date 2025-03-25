// Fichier: import-client.js
// Description: Script client pour connecter l'interface d'importation au Cloudflare Worker

// URL de base de l'API (à remplacer par l'URL réelle du Worker déployé)
const API_BASE_URL = 'https://gestion-cles-api.karim-idou-courrier.workers.dev';

// Fonction pour initialiser la base de données (migration)
async function initializeDatabase() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/migrate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Erreur lors de l\'initialisation de la base de données');
    }
    
    console.log('Base de données initialisée avec succès');
    return data;
  } catch (error) {
    console.error('Erreur lors de l\'initialisation de la base de données:', error);
    throw error;
  }
}

// Fonction pour récupérer toutes les clés
async function getAllKeys() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/keys`);
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Erreur lors de la récupération des clés');
    }
    
    return data;
  } catch (error) {
    console.error('Erreur lors de la récupération des clés:', error);
    throw error;
  }
}

// Fonction pour importer des clés depuis un fichier Excel
async function importKeys(keys) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/keys/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ keys }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || 'Erreur lors de l\'importation des clés');
    }
    
    return data;
  } catch (error) {
    console.error('Erreur lors de l\'importation des clés:', error);
    throw error;
  }
}

// Fonction pour transformer les données Excel en format compatible avec l'API
function transformExcelData(excelData, mappings) {
  // Ignorer la première ligne (en-têtes)
  const dataRows = excelData.slice(1);
  
  // Transformer chaque ligne en objet clé
  return dataRows.map(row => {
    const key = {};
    
    // Appliquer les mappages
    for (const [fieldId, columnIndex] of Object.entries(mappings)) {
      if (columnIndex !== null && columnIndex !== undefined) {
        key[fieldId] = row[columnIndex];
      }
    }
    
    // S'assurer que les champs obligatoires sont présents
    if (!key.key_name) {
      throw new Error('Le nom de la clé est obligatoire');
    }
    
    // Convertir la quantité en nombre
    if (key.quantity) {
      key.quantity = parseInt(key.quantity, 10) || 1;
    } else {
      key.quantity = 1;
    }
    
    return key;
  });
}

// Fonction pour démarrer l'importation réelle
async function startRealImport(excelData, mappings, updateProgress, updateStatus) {
  try {
    // Transformer les données Excel
    const keys = transformExcelData(excelData, mappings);
    
    // Mettre à jour le statut
    updateStatus(`Préparation de l'importation de ${keys.length} clés...`);
    
    // Initialiser la base de données si nécessaire
    await initializeDatabase().catch(error => {
      console.log('La base de données existe déjà ou erreur ignorable:', error);
    });
    
    // Mettre à jour la progression
    updateProgress(10);
    
    // Importer les clés
    updateStatus('Importation des clés en cours...');
    const result = await importKeys(keys);
    
    // Mettre à jour la progression
    updateProgress(100);
    
    // Mettre à jour le statut
    updateStatus(`Importation terminée avec succès! ${result.imported} clés importées, ${result.updated} clés mises à jour.`);
    
    return result;
  } catch (error) {
    updateStatus(`Erreur lors de l'importation: ${error.message}`, 'error');
    throw error;
  }
}

// Exporter les fonctions pour les utiliser dans l'interface
window.keyManagementApi = {
  initializeDatabase,
  getAllKeys,
  importKeys,
  transformExcelData,
  startRealImport,
};
