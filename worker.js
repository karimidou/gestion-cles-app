// Fichier: worker.js
// Description: Cloudflare Worker pour gérer l'importation des données Excel et les opérations CRUD sur la base de données D1

// Configuration des en-têtes CORS pour permettre les requêtes cross-origin
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Fonction pour gérer les requêtes OPTIONS (pré-flight CORS)
function handleOptions(request) {
  return new Response(null, {
    headers: corsHeaders,
  });
}

// Fonction pour créer une réponse JSON avec les en-têtes CORS
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

// Fonction principale qui gère toutes les requêtes
export default {
  async fetch(request, env, ctx) {
    // Gérer les requêtes OPTIONS pour CORS
    if (request.method === 'OPTIONS') {
      return handleOptions(request);
    }

    // Extraire le chemin de l'URL
    const url = new URL(request.url);
    const path = url.pathname.split('/').filter(Boolean);

    // Route pour l'API
    if (path[0] === 'api') {
      // Route pour les clés
      if (path[1] === 'keys') {
        // GET /api/keys - Récupérer toutes les clés
        if (request.method === 'GET' && path.length === 2) {
          try {
            const keys = await env.DB.prepare('SELECT * FROM keys').all();
            return jsonResponse(keys.results);
          } catch (error) {
            return jsonResponse({ error: error.message }, 500);
          }
        }
        
        // GET /api/keys/:id - Récupérer une clé spécifique
        if (request.method === 'GET' && path.length === 3) {
          const keyId = path[2];
          try {
            const key = await env.DB.prepare('SELECT * FROM keys WHERE key_id = ?').bind(keyId).first();
            if (!key) {
              return jsonResponse({ error: 'Clé non trouvée' }, 404);
            }
            return jsonResponse(key);
          } catch (error) {
            return jsonResponse({ error: error.message }, 500);
          }
        }
        
        // POST /api/keys - Créer une nouvelle clé
        if (request.method === 'POST' && path.length === 2) {
          try {
            const data = await request.json();
            
            // Validation des données
            if (!data.key_name) {
              return jsonResponse({ error: 'Le nom de la clé est requis' }, 400);
            }
            
            // Vérifier si la clé existe déjà
            const existingKey = await env.DB.prepare('SELECT * FROM keys WHERE key_name = ?').bind(data.key_name).first();
            if (existingKey) {
              return jsonResponse({ error: 'Une clé avec ce nom existe déjà' }, 409);
            }
            
            // Insérer la nouvelle clé
            const result = await env.DB.prepare(
              'INSERT INTO keys (key_name, quantity, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
            ).bind(
              data.key_name,
              data.quantity || 1,
              data.description || '',
              new Date().toISOString(),
              new Date().toISOString()
            ).run();
            
            return jsonResponse({ success: true, key_id: result.meta.last_row_id }, 201);
          } catch (error) {
            return jsonResponse({ error: error.message }, 500);
          }
        }
        
        // PUT /api/keys/:id - Mettre à jour une clé
        if (request.method === 'PUT' && path.length === 3) {
          const keyId = path[2];
          try {
            const data = await request.json();
            
            // Vérifier si la clé existe
            const existingKey = await env.DB.prepare('SELECT * FROM keys WHERE key_id = ?').bind(keyId).first();
            if (!existingKey) {
              return jsonResponse({ error: 'Clé non trouvée' }, 404);
            }
            
            // Mettre à jour la clé
            await env.DB.prepare(
              'UPDATE keys SET key_name = ?, quantity = ?, description = ?, updated_at = ? WHERE key_id = ?'
            ).bind(
              data.key_name || existingKey.key_name,
              data.quantity || existingKey.quantity,
              data.description || existingKey.description,
              new Date().toISOString(),
              keyId
            ).run();
            
            return jsonResponse({ success: true });
          } catch (error) {
            return jsonResponse({ error: error.message }, 500);
          }
        }
        
        // DELETE /api/keys/:id - Supprimer une clé
        if (request.method === 'DELETE' && path.length === 3) {
          const keyId = path[2];
          try {
            // Vérifier si la clé existe
            const existingKey = await env.DB.prepare('SELECT * FROM keys WHERE key_id = ?').bind(keyId).first();
            if (!existingKey) {
              return jsonResponse({ error: 'Clé non trouvée' }, 404);
            }
            
            // Supprimer la clé
            await env.DB.prepare('DELETE FROM keys WHERE key_id = ?').bind(keyId).run();
            
            return jsonResponse({ success: true });
          } catch (error) {
            return jsonResponse({ error: error.message }, 500);
          }
        }
        
        // POST /api/keys/import - Importer des clés depuis un fichier Excel
        if (request.method === 'POST' && path.length === 3 && path[2] === 'import') {
          try {
            const data = await request.json();
            
            if (!Array.isArray(data.keys) || data.keys.length === 0) {
              return jsonResponse({ error: 'Aucune donnée de clé valide fournie' }, 400);
            }
            
            const results = {
              total: data.keys.length,
              imported: 0,
              updated: 0,
              errors: 0,
              errorDetails: []
            };
            
            // Traiter chaque clé
            for (const key of data.keys) {
              try {
                // Vérifier si la clé existe déjà
                const existingKey = await env.DB.prepare('SELECT * FROM keys WHERE key_name = ?').bind(key.key_name).first();
                
                if (existingKey) {
                  // Mettre à jour la clé existante
                  await env.DB.prepare(
                    'UPDATE keys SET quantity = ?, description = ?, updated_at = ? WHERE key_id = ?'
                  ).bind(
                    key.quantity || existingKey.quantity,
                    key.description || existingKey.description,
                    new Date().toISOString(),
                    existingKey.key_id
                  ).run();
                  
                  results.updated++;
                } else {
                  // Insérer une nouvelle clé
                  await env.DB.prepare(
                    'INSERT INTO keys (key_name, quantity, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
                  ).bind(
                    key.key_name,
                    key.quantity || 1,
                    key.description || '',
                    new Date().toISOString(),
                    new Date().toISOString()
                  ).run();
                  
                  results.imported++;
                }
              } catch (error) {
                results.errors++;
                results.errorDetails.push({
                  key: key.key_name,
                  error: error.message
                });
              }
            }
            
            return jsonResponse(results);
          } catch (error) {
            return jsonResponse({ error: error.message }, 500);
          }
        }
      }
      
      // Route pour les emplacements
      if (path[1] === 'locations') {
        // GET /api/locations - Récupérer tous les emplacements
        if (request.method === 'GET' && path.length === 2) {
          try {
            const locations = await env.DB.prepare('SELECT * FROM locations').all();
            return jsonResponse(locations.results);
          } catch (error) {
            return jsonResponse({ error: error.message }, 500);
          }
        }
        
        // Autres opérations CRUD pour les emplacements...
      }
      
      // Route pour les prêts
      if (path[1] === 'loans') {
        // GET /api/loans - Récupérer tous les prêts
        if (request.method === 'GET' && path.length === 2) {
          try {
            const loans = await env.DB.prepare('SELECT * FROM loans').all();
            return jsonResponse(loans.results);
          } catch (error) {
            return jsonResponse({ error: error.message }, 500);
          }
        }
        
        // Autres opérations CRUD pour les prêts...
      }
      
      // Route pour la migration de la base de données
      if (path[1] === 'migrate' && request.method === 'POST') {
        try {
          // Créer la table des clés
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS keys (
              key_id INTEGER PRIMARY KEY AUTOINCREMENT,
              key_name TEXT NOT NULL UNIQUE,
              quantity INTEGER NOT NULL DEFAULT 1,
              description TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
          `).run();
          
          // Créer la table des emplacements
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS locations (
              location_id INTEGER PRIMARY KEY AUTOINCREMENT,
              location_name TEXT NOT NULL UNIQUE,
              description TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
          `).run();
          
          // Créer la table de relation clés-emplacements
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS key_locations (
              key_location_id INTEGER PRIMARY KEY AUTOINCREMENT,
              key_id INTEGER NOT NULL,
              location_id INTEGER NOT NULL,
              quantity INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              FOREIGN KEY (key_id) REFERENCES keys (key_id),
              FOREIGN KEY (location_id) REFERENCES locations (location_id),
              UNIQUE (key_id, location_id)
            )
          `).run();
          
          // Créer la table des emprunteurs
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS borrowers (
              borrower_id INTEGER PRIMARY KEY AUTOINCREMENT,
              full_name TEXT NOT NULL,
              category TEXT,
              contact_info TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
          `).run();
          
          // Créer la table des prêts
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS loans (
              loan_id INTEGER PRIMARY KEY AUTOINCREMENT,
              borrower_id INTEGER NOT NULL,
              paper_register_number TEXT,
              entry_number TEXT,
              loan_date TEXT NOT NULL,
              expected_return_date TEXT,
              actual_return_date TEXT,
              status TEXT NOT NULL,
              notes TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              FOREIGN KEY (borrower_id) REFERENCES borrowers (borrower_id)
            )
          `).run();
          
          // Créer la table des détails de prêt
          await env.DB.prepare(`
            CREATE TABLE IF NOT EXISTS loan_details (
              loan_detail_id INTEGER PRIMARY KEY AUTOINCREMENT,
              loan_id INTEGER NOT NULL,
              key_id INTEGER NOT NULL,
              quantity INTEGER NOT NULL DEFAULT 1,
              returned_quantity INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              FOREIGN KEY (loan_id) REFERENCES loans (loan_id),
              FOREIGN KEY (key_id) REFERENCES keys (key_id)
            )
          `).run();
          
          return jsonResponse({ success: true, message: 'Migration de la base de données réussie' });
        } catch (error) {
          return jsonResponse({ error: error.message }, 500);
        }
      }
    }
    
    // Si aucune route ne correspond, renvoyer une erreur 404
    return jsonResponse({ error: 'Route non trouvée' }, 404);
  },
};
