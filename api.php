<?php
/**
 * MAFIA WARS — api.php
 * REST-ish API using flat JSON file storage
 * Handles: join, state, start, night_kill, vote, next_phase
 *
 * NOTE: This requires a PHP-capable server.
 *       Netlify does NOT support PHP.
 *       Use: cPanel hosting / VPS / Heroku with PHP / Railway.app / Render.com
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

// ─────────────────────────────────────────────
//  FILE PATHS
// ─────────────────────────────────────────────
define('DATA_DIR',   __DIR__ . '/data/');
define('STATE_FILE', DATA_DIR . 'gamestate.json');
define('LOCK_FILE',  DATA_DIR . 'gamestate.lock');

if (!is_dir(DATA_DIR)) mkdir(DATA_DIR, 0755, true);

// ─────────────────────────────────────────────
//  ROUTING
// ─────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$action = '';

if ($method === 'GET') {
    $action = $_GET['action'] ?? '';
    $pid    = $_GET['pid']    ?? '';
} elseif ($method === 'POST') {
    $body   = json_decode(file_get_contents('php://input'), true) ?? [];
    $action = $body['action'] ?? '';
    $pid    = $body['playerId'] ?? $body['id'] ?? '';
}

switch ($action) {
    case 'join':        handleJoin($body ?? []); break;
    case 'state':       handleState($pid);       break;
    case 'start':       handleStart($body ?? []); break;
    case 'night_kill':  handleNightKill($body ?? []); break;
    case 'vote':        handleVote($body ?? []);  break;
    default:
        echo json_encode(['success' => false, 'message' => 'Unknown action: ' . $action]);
}

// ─────────────────────────────────────────────
//  HANDLERS
// ─────────────────────────────────────────────

function handleJoin(array $body): void {
    $id    = sanitize($body['id']    ?? '');
    $name  = sanitize($body['name']  ?? 'Anonymous');
    $motto = sanitize($body['motto'] ?? '...');

    if (!$id) {
        echo json_encode(['success' => false, 'message' => 'No player ID']);
        return;
    }

    $state = loadState();

    // If game already in progress and player not in list, reject
    if ($state['phase'] !== 'lobby') {
        $exists = playerExists($state, $id);
        if (!$exists) {
            echo json_encode(['success' => false, 'message' => 'Game already in progress']);
            return;
        }
        echo json_encode([
            'success'   => true,
            'playerId'  => $id,
            'isHost'    => ($state['hostId'] === $id),
            'gamePhase' => $state['phase'],
        ]);
        return;
    }

    // Remove stale players (inactive > 30s)
    $now = time();
    $state['players'] = array_values(array_filter($state['players'], function($p) use ($now) {
        return ($now - ($p['lastPing'] ?? 0)) < 30;
    }));

    // Upsert player
    $found = false;
    foreach ($state['players'] as &$p) {
        if ($p['id'] === $id) {
            $p['name']     = $name;
            $p['motto']    = $motto;
            $p['lastPing'] = $now;
            $found = true;
            break;
        }
    }
    unset($p);

    if (!$found) {
        $isFirstPlayer = count($state['players']) === 0;
        $state['players'][] = [
            'id'       => $id,
            'name'     => $name,
            'motto'    => $motto,
            'isHost'   => $isFirstPlayer,
            'isBot'    => false,
            'role'     => null,
            'alive'    => true,
            'lastPing' => $now,
        ];
        if ($isFirstPlayer) {
            $state['hostId'] = $id;
        }
    }

    saveState($state);

    echo json_encode([
        'success'   => true,
        'playerId'  => $id,
        'isHost'    => ($state['hostId'] === $id),
        'gamePhase' => $state['phase'],
    ]);
}

function handleState(string $pid): void {
    $state = loadState();

    // Update last ping for this player
    $now = time();
    foreach ($state['players'] as &$p) {
        if ($p['id'] === $pid) {
            $p['lastPing'] = $now;
            break;
        }
    }
    unset($p);

    // Check if we need to auto-advance phases
    autoAdvancePhase($state);

    saveState($state);

    // Return public state (hide other players' roles)
    $publicState = buildPublicState($state, $pid);

    echo json_encode(array_merge(['success' => true], $publicState));
}

function handleStart(array $body): void {
    $hostId = $body['hostId'] ?? '';
    $state  = loadState();

    if ($state['hostId'] !== $hostId) {
        echo json_encode(['success' => false, 'message' => 'Only the host can start the game']);
        return;
    }

    // Remove stale players
    $now = time();
    $state['players'] = array_values(array_filter($state['players'], function($p) use ($now) {
        return ($now - ($p['lastPing'] ?? 0)) < 15;
    }));

    $playerCount = count($state['players']);

    // Add bots to reach minimum 4 players
    while (count($state['players']) < 4) {
        $botNames  = ['Don Carlo','Vinnie Scar','Lucky','The Shadow','Knuckles','Two-Face','Sal'];
        $botMottos = ['Never talk','Silence is gold','I saw nothing','Who, me?','Just business','Capisce?','Omerta'];
        $idx = count($state['players']);
        $state['players'][] = [
            'id'       => 'bot_' . $idx . '_' . rand(100,999),
            'name'     => $botNames[$idx % count($botNames)],
            'motto'    => $botMottos[$idx % count($botMottos)],
            'isHost'   => false,
            'isBot'    => true,
            'role'     => null,
            'alive'    => true,
            'lastPing' => time(),
        ];
    }

    // Assign roles
    $state['players'] = assignRoles($state['players']);

    // Set phase
    $state['phase']     = 'role_reveal';
    $state['round']     = 1;
    $state['phaseStart'] = time();
    $state['votes']     = [];
    $state['nightKills'] = [];
    $state['lastKilled'] = null;

    saveState($state);

    echo json_encode(['success' => true]);
}

function handleNightKill(array $body): void {
    $playerId = $body['playerId'] ?? '';
    $targetId = $body['targetId'] ?? '';
    $state    = loadState();

    if ($state['phase'] !== 'night') {
        echo json_encode(['success' => false, 'message' => 'Not night phase']);
        return;
    }

    // Verify killer is mafia
    $killer = null;
    foreach ($state['players'] as $p) {
        if ($p['id'] === $playerId) { $killer = $p; break; }
    }

    if (!$killer || strtolower($killer['role'] ?? '') !== 'mafia') {
        echo json_encode(['success' => false, 'message' => 'Not a mafia member']);
        return;
    }

    $state['nightKills'][$playerId] = $targetId;
    saveState($state);

    echo json_encode(['success' => true]);
}

function handleVote(array $body): void {
    $playerId = $body['playerId'] ?? '';
    $targetId = $body['targetId'] ?? '';
    $state    = loadState();

    if ($state['phase'] !== 'voting') {
        echo json_encode(['success' => false, 'message' => 'Not voting phase']);
        return;
    }

    $state['votes'][$playerId] = $targetId;
    saveState($state);

    // Check if all alive players voted
    $alivePlayers = array_filter($state['players'], fn($p) => $p['alive'] !== false);
    if (count($state['votes']) >= count($alivePlayers)) {
        processVotes($state);
    }

    saveState($state);

    echo json_encode(['success' => true]);
}

// ─────────────────────────────────────────────
//  PHASE AUTO-ADVANCE
// ─────────────────────────────────────────────
function autoAdvancePhase(array &$state): void {
    $elapsed = time() - ($state['phaseStart'] ?? time());

    switch ($state['phase']) {
        case 'role_reveal':
            if ($elapsed >= 6) transitionToNight($state);
            break;

        case 'night':
            // If all mafia have voted, advance early
            $mafiaIds = getMafiaIds($state);
            $killCount = 0;
            foreach ($mafiaIds as $mid) {
                if (isset($state['nightKills'][$mid])) $killCount++;
            }
            $shouldAdvance = ($elapsed >= 22) || ($killCount >= count($mafiaIds) && count($mafiaIds) > 0);
            if ($shouldAdvance) {
                processMafia($state);
                $state['phase']      = 'morning';
                $state['phaseStart'] = time();
            }
            break;

        case 'morning':
            if ($elapsed >= 15) {
                $state['phase']      = 'voting';
                $state['phaseStart'] = time();
                $state['votes']      = [];
                checkWinCondition($state);
            }
            break;

        case 'voting':
            if ($elapsed >= 32) {
                processVotes($state);
            }
            break;
    }
}

function transitionToNight(array &$state): void {
    $state['phase']      = 'night';
    $state['phaseStart'] = time();
    $state['nightKills'] = [];
    // Bot mafia auto-targets
    foreach ($state['players'] as $p) {
        if ($p['isBot'] && strtolower($p['role'] ?? '') === 'mafia' && $p['alive'] !== false) {
            $targets = array_filter($state['players'], fn($t) =>
                $t['alive'] !== false &&
                $t['id'] !== $p['id'] &&
                strtolower($t['role'] ?? '') !== 'mafia'
            );
            if ($targets) {
                $targets = array_values($targets);
                $pick = $targets[array_rand($targets)];
                $state['nightKills'][$p['id']] = $pick['id'];
            }
        }
    }
}

function processMafia(array &$state): void {
    // Count votes for each target
    $killVotes = array_count_values($state['nightKills'] ?? []);
    if (empty($killVotes)) {
        $state['lastKilled'] = null;
        return;
    }
    arsort($killVotes);
    $victimId = array_key_first($killVotes);

    foreach ($state['players'] as &$p) {
        if ($p['id'] === $victimId) {
            $p['alive'] = false;
            $state['lastKilled'] = $p['name'];
            break;
        }
    }
    unset($p);
}

function processVotes(array &$state): void {
    $voteCounts = array_count_values($state['votes'] ?? []);
    if (empty($voteCounts)) {
        nextRound($state);
        return;
    }
    arsort($voteCounts);
    $eliminatedId = array_key_first($voteCounts);

    // Bot players auto-vote for a random non-bot non-self
    foreach ($state['players'] as $p) {
        if ($p['isBot'] && $p['alive'] !== false && !isset($state['votes'][$p['id']])) {
            $targets = array_filter($state['players'], fn($t) =>
                $t['alive'] !== false && $t['id'] !== $p['id']
            );
            if ($targets) {
                $targets = array_values($targets);
                $pick = $targets[array_rand($targets)];
                $state['votes'][$p['id']] = $pick['id'];
            }
        }
    }

    // Re-count with bot votes
    $voteCounts = array_count_values($state['votes'] ?? []);
    arsort($voteCounts);
    $eliminatedId = array_key_first($voteCounts);

    foreach ($state['players'] as &$p) {
        if ($p['id'] === $eliminatedId) {
            $p['alive'] = false;
            $state['lastEliminated'] = $p['name'];
            break;
        }
    }
    unset($p);

    checkWinCondition($state);
    if ($state['phase'] !== 'gameover') nextRound($state);
}

function checkWinCondition(array &$state): void {
    $alive    = array_filter($state['players'], fn($p) => $p['alive'] !== false);
    $mafiaAlive = array_filter($alive, fn($p) => strtolower($p['role'] ?? '') === 'mafia');
    $civAlive   = array_filter($alive, fn($p) => strtolower($p['role'] ?? '') !== 'mafia');

    if (count($mafiaAlive) === 0) {
        $state['phase']  = 'gameover';
        $state['winner'] = 'civilians';
    } elseif (count($mafiaAlive) >= count($civAlive)) {
        $state['phase']  = 'gameover';
        $state['winner'] = 'mafia';
    }
}

function nextRound(array &$state): void {
    $state['round']++;
    $state['phase']      = 'night';
    $state['phaseStart'] = time();
    $state['nightKills'] = [];
    $state['votes']      = [];
    $state['lastKilled'] = null;

    // Bot mafia auto-targets for new round
    transitionToNight($state);
}

// ─────────────────────────────────────────────
//  ROLE ASSIGNMENT
// ─────────────────────────────────────────────
function assignRoles(array $players): array {
    $count = count($players);
    $mafiaCount = $count >= 8 ? 2 : 1;

    $roles = array_fill(0, $mafiaCount, 'MAFIA');
    while (count($roles) < $count) $roles[] = 'CIVILIAN';

    shuffle($roles);

    foreach ($players as $i => &$p) {
        if (!$p['isBot']) {
            // Human players get assigned in order after shuffle
        }
        $p['role'] = $roles[$i];
    }
    unset($p);

    return $players;
}

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function getMafiaIds(array $state): array {
    return array_column(
        array_filter($state['players'], fn($p) => strtolower($p['role'] ?? '') === 'mafia'),
        'id'
    );
}

function playerExists(array $state, string $id): bool {
    foreach ($state['players'] as $p) {
        if ($p['id'] === $id) return true;
    }
    return false;
}

function buildPublicState(array $state, string $myId): array {
    $public = $state;
    foreach ($public['players'] as &$p) {
        if ($p['id'] !== $myId && $state['phase'] !== 'gameover') {
            // Hide roles of others during the game
            $p['role'] = null;
        }
    }
    unset($p);
    return $public;
}

function sanitize(string $str): string {
    return htmlspecialchars(trim(substr($str, 0, 64)), ENT_QUOTES, 'UTF-8');
}

// ─────────────────────────────────────────────
//  FILE I/O
// ─────────────────────────────────────────────
function defaultState(): array {
    return [
        'phase'         => 'lobby',
        'round'         => 0,
        'players'       => [],
        'hostId'        => null,
        'votes'         => [],
        'nightKills'    => [],
        'lastKilled'    => null,
        'lastEliminated'=> null,
        'winner'        => null,
        'phaseStart'    => time(),
    ];
}

function loadState(): array {
    if (!file_exists(STATE_FILE)) return defaultState();
    $json = file_get_contents(STATE_FILE);
    $data = json_decode($json, true);
    return is_array($data) ? $data : defaultState();
}

function saveState(array $state): void {
    $lock = fopen(LOCK_FILE, 'w');
    if (flock($lock, LOCK_EX)) {
        file_put_contents(STATE_FILE, json_encode($state, JSON_PRETTY_PRINT));
        flock($lock, LOCK_UN);
    }
    fclose($lock);
}
