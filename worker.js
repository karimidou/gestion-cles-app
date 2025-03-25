// Cloudflare Worker pour l'API de gestion des clés
// Ce worker gère les opérations CRUD pour les clés, emplacements et prêts

// Importation des modules nécessaires
import { Router } from 'itty-router';

// Création du router
const router = Router();

// Middleware CORS pour permettre les requêtes cross-origin
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Fonction pour créer une réponse JSON
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

// Middleware pour gérer les requêtes OPTIONS (CORS preflight)
router.options('*', () => {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
});

// Route pour initialiser la base de données
router.post('/api/migrate', async (request, env) => {
  try {
    const db = env.DB;
    
    // Créer la table des clés
    await db.exec(`
      CREATE TABLE IF NOT EXISTS keys (
        key_id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_name TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Créer la table des emplacements
    await db.exec(`
      CREATE TABLE IF NOT EXISTS locations (
        location_id INTEGER PRIMARY KEY AUTOINCREMENT,
        location_name TEXT NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Créer la table de relation entre clés et emplacements
    await db.exec(`
      CREATE TABLE IF NOT EXISTS key_locations (
        key_location_id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_id INTEGER NOT NULL,
        location_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (key_id) REFERENCES keys (key_id),
        FOREIGN KEY (location_id) REFERENCES locations (location_id)
      )
    `);
    
    // Créer la table des emprunteurs
    await db.exec(`
      CREATE TABLE IF NOT EXISTS borrowers (
        borrower_id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        category TEXT,
        contact_info TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Créer la table des prêts
    await db.exec(`
      CREATE TABLE IF NOT EXISTS loans (
        loan_id INTEGER PRIMARY KEY AUTOINCREMENT,
        borrower_id INTEGER NOT NULL,
        paper_register_number TEXT,
        entry_number TEXT,
        loan_date TIMESTAMP NOT NULL,
        expected_return_date TIMESTAMP,
        actual_return_date TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'active',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (borrower_id) REFERENCES borrowers (borrower_id)
      )
    `);
    
    // Créer la table des détails de prêt
    await db.exec(`
      CREATE TABLE IF NOT EXISTS loan_details (
        loan_detail_id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id INTEGER NOT NULL,
        key_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        returned_quantity INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (loan_id) REFERENCES loans (loan_id),
        FOREIGN KEY (key_id) REFERENCES keys (key_id)
      )
    `);
    
    return jsonResponse({ success: true, message: 'Base de données initialisée avec succès' });
  } catch (error) {
    console.error('Erreur lors de l\'initialisation de la base de données:', error);
    return jsonResponse({ error: error.message }, 500);
  }
});

// Route pour récupérer toutes les clés
router.get('/api/keys', async (request, env) => {
  try {
    const db = env.DB;
    const keys = await db.prepare('SELECT * FROM keys ORDER BY key_name').all();
    return jsonResponse(keys.results);
  } catch (error) {
    console.error('Erreur lors de la récupération des clés:', error);
    return jsonResponse({ error: error.message }, 500);
  }
});

// Route pour récupérer une clé par son ID
router.get('/api/keys/:id', async (request, env) => {
  try {
    const { id } = request.params;
    const db = env.DB;
    const key = await db.prepare('SELECT * FROM keys WHERE key_id = ?').bind(id).first();
    
    if (!key) {
      return jsonResponse({ error: 'Clé non trouvée' }, 404);
    }
    
    return jsonResponse(key);
  } catch (error) {
    console.error('Erreur lors de la récupération de la clé:', error);
    return jsonResponse({ error: error.message }, 500);
  }
});

// Route pour créer une nouvelle clé
router.post('/api/keys', async (request, env) => {
  try {
    const db = env.DB;
    const { key_name, quantity, description } = await request.json();
    
    if (!key_name) {
      return jsonResponse({ error: 'Le nom de la clé est requis' }, 400);
    }
    
    const result = await db.prepare(
      'INSERT INTO keys (key_name, quantity, description) VALUES (?, ?, ?)'
    ).bind(key_name, quantity || 1, description || null).run();
    
    const key = await db.prepare('SELECT * FROM keys WHERE key_id = ?').bind(result.meta.last_row_id).first();
    
    return jsonResponse(key, 201);
  } catch (error) {
    console.error('Erreur lors de la création de la clé:', error);
    return jsonResponse({ error: error.message }, 500);
  }
});

// Route pour mettre à jour une clé
router.put('/api/keys/:id', async (request, env) => {
  try {
    const { id } = request.params;
    const db = env.DB;
    const { key_name, quantity, description } = await request.json();
    
    if (!key_name) {
      return jsonResponse({ error: 'Le nom de la clé est requis' }, 400);
    }
    
    const key = await db.prepare('SELECT * FROM keys WHERE key_id = ?').bind(id).first();
    
    if (!key) {
      return jsonResponse({ error: 'Clé non trouvée' }, 404);
    }
    
    await db.prepare(
      'UPDATE keys SET key_name = ?, quantity = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE key_id = ?'
    ).bind(key_name, quantity || 1, description || null, id).run();
    
    const updatedKey = await db.prepare('SELECT * FROM keys WHERE key_id = ?').bind(id).first();
    
    return jsonResponse(updatedKey);
  } catch (error) {
    console.error('Erreur lors de la mise à jour de la clé:', error);
    return jsonResponse({ error: error.message }, 500);
  }
});

// Route pour supprimer une clé
router.delete('/api/keys/:id', async (request, env) => {
  try {
    const { id } = request.params;
    const db = env.DB;
    
    const key = await db.prepare('SELECT * FROM keys WHERE key_id = ?').bind(id).first();
    
    if (!key) {
      return jsonResponse({ error: 'Clé non trouvée' }, 404);
    }
    
    await db.prepare('DELETE FROM keys WHERE key_id = ?').bind(id).run();
    
    return jsonResponse({ success: true, message: 'Clé supprimée avec succès' });
  } catch (error) {
    console.error('Erreur lors de la suppression de la clé:', error);
    return jsonResponse({ error: error.message }, 500);
  }
});

// Route pour importer des clés depuis Excel
router.post('/api/keys/import', async (request, env) => {
  try {
    const db = env.DB;
    const { keys } = await request.json();
    
    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      return jsonResponse({ error: 'Aucune donnée à importer' }, 400);
    }
    
    let imported = 0;
    let updated = 0;
    let errors = 0;
    
    for (const key of keys) {
      try {
        if (!key.key_name) {
          errors++;
          continue;
        }
        
        // Vérifier si la clé existe déjà
        const existingKey = await db.prepare('SELECT * FROM keys WHERE key_name = ?').bind(key.key_name).first();
        
        if (existingKey) {
          // Mettre à jour la clé existante
          await db.prepare(
            'UPDATE keys SET quantity = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE key_id = ?'
          ).bind(key.quantity || 1, key.description || null, existingKey.key_id).run();
          
          updated++;
        } else {
          // Créer une nouvelle clé
          await db.prepare(
            'INSERT INTO keys (key_name, quantity, description) VALUES (?, ?, ?)'
          ).bind(key.key_name, key.quantity || 1, key.description || null).run();
          
          imported++;
        }
      } catch (error) {
        console.error('Erreur lors de l\'importation d\'une clé:', error);
        errors++;
      }
    }
    
    return jsonResponse({
      success: true,
      total: keys.length,
      imported,
      updated,
      errors
    });
  } catch (error) {
    console.error('Erreur lors de l\'importation des clés:', error);
    return jsonResponse({ error: error.message }, 500);
  }
});

// Route par défaut pour les routes non trouvées
router.all('*', () => {
  return jsonResponse({ error: 'Route non trouvée' }, 404);
});

// Fonction principale qui gère toutes les requêtes
export default {
  async fetch(request, env, ctx) {
    return router.handle(request, env, ctx);
  }
};
