/**
 * Initiative Partitioner Module
 * Automatically creates multiple combatant entries when a specific initiative value is rolled
 */

// Store roll data for initiative rolls by combatant ID
let initiativeRollData = new Map();

Hooks.once("init", () => {
  console.log("Initiative Partitioner | Initializing");

  // Register module settings
  game.settings.register("initiative-partitioner", "enabled", {
    name: "Enable Initiative Partitioning",
    hint: "Enable automatic initiative partitioning",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register("initiative-partitioner", "targetInitiative", {
    name: "Target Initiative Value",
    hint: "The minimum initiative value that triggers partitioning (e.g., 50 for 50+)",
    scope: "world",
    config: true,
    type: Number,
    default: 21,
    range: {
      min: 1,
      max: 10000,
      step: 1
    }
  });

  game.settings.register("initiative-partitioner", "partitionCount", {
    name: "Number of Partitions",
    hint: "How many combatant entries to create (e.g., 3 for 50, 30, 10)",
    scope: "world",
    config: true,
    type: Number,
    default: 99999,
    range: {
      min: 2,
      max: 99999,
      step: 1
    }
  });

  game.settings.register("initiative-partitioner", "partitionOffset", {
    name: "Partition Offset",
    hint: "The amount to subtract for each partition (e.g., 20 for 50, 30, 10)",
    scope: "world",
    config: true,
    type: Number,
    default: 20,
    range: {
      min: 1,
      max: 99999,
      step: 1
    }
  });
});

/**
 * Helper function to check if a combatant is a partition
 */
function isPartition(combatant) {
  return combatant?.flags?.["initiative-partitioner"]?.isPartition === true;
}


function findsD20(combatant, updateData, options) {
  let combatantId = combatant.id || combatant._id;
  let actorId = combatant.actorId || combatant.actor?.id;

  // 1. Check stored roll data from chat hook (most reliable)
  let storedRoll = initiativeRollData.get(combatantId) || initiativeRollData.get(actorId);
  if (storedRoll && storedRoll.terms) {
    let d20Term = storedRoll.terms.find(t => t?.faces === 20);
    if (d20Term && d20Term.results && Array.isArray(d20Term.results)) {
      let activeResult = d20Term.results.find(r => r?.active !== false);
      if (activeResult) {
        let d20Value = activeResult.result ?? activeResult.value ?? activeResult.total;
        if (d20Value !== undefined && d20Value !== null) {
          console.log(`Initiative Partitioner | Found d20 from stored roll data: ${d20Value}`);
          return d20Value;
        }
      }
    }
  }

  // 2. Check the options.roll object (The primary source)
  let roll = options?.roll;
  if (roll && roll.terms) {
    let d20Term = roll.terms.find(t => t?.faces === 20);
    if (d20Term && d20Term.results && Array.isArray(d20Term.results)) {
      // Find the active result (handles advantage/disadvantage)
      let activeResult = d20Term.results.find(r => r?.active !== false);
      if (activeResult) {
        let d20Value = activeResult.result ?? activeResult.value ?? activeResult.total;
        if (d20Value !== undefined && d20Value !== null) {
          console.log(`Initiative Partitioner | Found d20 from options.roll: ${d20Value}`);
          return d20Value;
        }
      }
    }
  }

  // 3. Safety Fallback: Check the combatant's internal roll flag
  let combatantDoc = game.combat?.combatants.get(combatantId);
  
  if (combatantDoc?.getFlag) {
    try {
      let flagRoll = combatantDoc.getFlag("core", "initiativeRoll");
      if (flagRoll) {
        let rData = typeof flagRoll === "string" ? JSON.parse(flagRoll) : flagRoll;
        let d20 = rData.terms?.find(t => t?.faces === 20);
        
        if (d20 && d20.results && Array.isArray(d20.results)) {
          // In the flag data, we look for the result that is 'active'
          let activeResult = d20.results.find(r => r?.active !== false);
          if (activeResult) {
            let d20Value = activeResult.result ?? activeResult.value ?? activeResult.total;
            if (d20Value !== undefined && d20Value !== null) {
              console.log(`Initiative Partitioner | Found d20 from combatant flag: ${d20Value}`);
              return d20Value;
            }
          }
        }
      }
    } catch (e) {
      console.warn("Initiative Partitioner | Error reading combatant flag:", e);
    }
  }

  // 4. Try to get from the combatant directly if it has roll data
  try {
    if (combatant.getFlag) {
      let flagRoll = combatant.getFlag("core", "initiativeRoll");
      if (flagRoll) {
        let rData = typeof flagRoll === "string" ? JSON.parse(flagRoll) : flagRoll;
        let d20 = rData.terms?.find(t => t?.faces === 20);
        
        if (d20 && d20.results && Array.isArray(d20.results)) {
          let activeResult = d20.results.find(r => r?.active !== false);
          if (activeResult) {
            let d20Value = activeResult.result ?? activeResult.value ?? activeResult.total;
            if (d20Value !== undefined && d20Value !== null) {
              console.log(`Initiative Partitioner | Found d20 from combatant.getFlag: ${d20Value}`);
              return d20Value;
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn("Initiative Partitioner | Error reading combatant.getFlag:", e);
  }

  console.warn(`Initiative Partitioner | Could not find d20 value for combatant ${combatantId}`);
  return 0; // Return 0 if no d20 was found
}

/**
 * Hook into chat messages to capture initiative roll data
 * Initiative rolls in FoundryVTT create chat messages with roll data
 */
Hooks.on("createChatMessage", (chatMessage) => {
  // Check if this is a roll message (initiative rolls create roll messages)
  if (chatMessage && chatMessage.isRoll && chatMessage.roll) {
    let roll = chatMessage.roll;
    let d20Term = roll.terms?.find(t => t?.faces === 20);
    
    // If this roll has a d20, it might be an initiative roll
    if (d20Term) {
      // Try to find which combatant this relates to
      // Check speaker actor and combat context
      let actorId = chatMessage.speaker?.actor;
      
      if (actorId && game.combat) {
        // Find combatant with this actor
        let combatants = game.combat.combatants.filter(c => c.actorId === actorId);
        
        for (let combatant of combatants) {
          // Store roll data with combatant ID
          initiativeRollData.set(combatant.id, roll);
          console.log(`Initiative Partitioner | Captured roll data for combatant ${combatant.id}:`, roll);
          
          // Clean up after 10 seconds (increased from 5 to give more time)
          setTimeout(() => {
            initiativeRollData.delete(combatant.id);
          }, 10000);
        }
      }
    }
  }
});

/**
 * Helper function to clean up existing partitions for a combatant
 */
async function cleanupPartitions(combat, originalCombatantId) {
  if (!combat) return;
  
  let combatants = combat.combatants;
  let partitionsToDelete = combatants.filter(c => 
    c.flags?.["initiative-partitioner"]?.originalId === originalCombatantId &&
    c.flags?.["initiative-partitioner"]?.natural20Duplicate !== true // Don't delete natural 20 duplicates here
  );
  
  if (partitionsToDelete.length > 0) {
    let idsToDelete = partitionsToDelete.map(c => c.id);
    await combat.deleteEmbeddedDocuments("Combatant", idsToDelete);
    console.log(`Initiative Partitioner | Cleaned up ${idsToDelete.length} existing partitions`);
  }
}

/**
 * Hook into combatant updates to detect initiative rolls
 */
Hooks.on("updateCombatant", async (combatant, updateData, options, userId) => {
  // Only process if enabled and if initiative was updated
  if (!game.settings.get("initiative-partitioner", "enabled")) {
    return;
  }

  // Skip if this is a partition or natural 20 duplicate (don't create from these)
  if (isPartition(combatant) || combatant.flags?.["initiative-partitioner"]?.natural20Duplicate === true) {
    return;
  }

  // Check if initiative was updated
  if (updateData.initiative === undefined) {
    return;
  }

  // Skip if this update was triggered by our module
  if (options.fromPartition) {
    return;
  }

  let targetInitiative = game.settings.get("initiative-partitioner", "targetInitiative");
  let partitionCount = game.settings.get("initiative-partitioner", "partitionCount");
  let partitionOffset = game.settings.get("initiative-partitioner", "partitionOffset");

  // Calculating d20 roll
  await new Promise(r => setTimeout(r, 50));
  let totalRoll = updateData.initiative; // e.g., 40
  let d20Value = findsD20(combatant, updateData, options); // e.g., 15
  let bonuses = totalRoll - d20Value; // Result: 25

  console.log("totalRoll:", totalRoll, "d20Value:", d20Value, "bonuses:", bonuses);

  // Check if the rolled initiative is greater than or equal to the target value
  if (bonuses >= targetInitiative) {
    // Subtract from the intiative value to get the bonuses only
    let rolledInitiative = (updateData.initiative - d20Value);
    console.log(`Initiative Partitioner | Detected initiative ${rolledInitiative} (>= ${targetInitiative + d20Value}) for ${combatant.name}`);
    
    // Get the combat instance
    let combat = combatant.combat;
    if (!combat) {
      console.warn("Initiative Partitioner | No combat instance found");
      return;
    }

    // Clean up any existing partitions for this combatant (in case initiative was re-rolled)
    await cleanupPartitions(combat, combatant.id);

    // Wait a bit to ensure the original update completes
    await new Promise(resolve => setTimeout(resolve, 100));

    // Create additional combatant entries with partitioned initiative values
    let combatantData = combatant.toObject();
    
    // Remove fields that shouldn't be copied
    let { _id, sort, ...cleanData } = combatantData;
    
    for (let i = 1; i < partitionCount; i++) {
      let newInitiative = rolledInitiative - (i * partitionOffset);
      
      // Only create if the new initiative is positive
      if (newInitiative > 0) {
        try {
          // Create a new combatant entry
          await combat.createEmbeddedDocuments("Combatant", [{
            ...cleanData,
            initiative: newInitiative,
            flags: {
              ...(cleanData.flags || {}),
              "initiative-partitioner": {
                isPartition: true,
                originalId: combatant.id,
                partitionIndex: i
              }
            }
          }], { fromPartition: true });
          
          // Small delay between creations to avoid timing issues
          await new Promise(resolve => setTimeout(resolve, 50));
          
          console.log(`Initiative Partitioner | Created partition ${i} with initiative ${newInitiative}`);
        } catch (error) {
          console.error(`Initiative Partitioner | Error creating partition ${i}:`, error);
        }
      }
    }
  }

  // Special case: Natural 20 on Turn 1 - create duplicate token with highest initiative
  // Check if the d20 roll itself was 20, not just the total
  if (d20Value === 20) {
      let combat = combatant.combat;
      if (!combat) {
        return;
      }
    // Check if it's turn 1 (round 1) of combat
    // If combat hasn't started or is on round 1, create duplicate
    let isTurn1 = !combat.started || combat.round === 1;
    
    if (isTurn1) {
      // Wait for partitions to be created first (if any)
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Get the updated combatant to find the highest initiative value
      let updatedCombatant = combat.combatants.get(combatant.id);
      if (!updatedCombatant) return;
      
      // Find all combatants with same original (including partitions)
      let allRelatedCombatants = combat.combatants.filter(c => 
        c.id === updatedCombatant.id || 
        c.flags?.["initiative-partitioner"]?.originalId === updatedCombatant.id
      );
      
      // Find the highest initiative value
      let highestInitiative = Math.max(...allRelatedCombatants.map(c => c.initiative || 0));
      
      // Check if we already created a natural 20 duplicate
      let hasNatural20Duplicate = allRelatedCombatants.some(c => 
        c.flags?.["initiative-partitioner"]?.natural20Duplicate === true
      );
      
      if (!hasNatural20Duplicate && highestInitiative > 0) {
        console.log(`Initiative Partitioner | Natural 20 on Turn 1! Creating duplicate with initiative ${highestInitiative}`);
        
        try {
          let combatantData = updatedCombatant.toObject();
          // Remove fields that shouldn't be copied
          let { _id, sort, ...cleanData } = combatantData;
          
          await combat.createEmbeddedDocuments("Combatant", [{
            ...cleanData,
            initiative: highestInitiative,
            flags: {
              ...(cleanData.flags || {}),
              "initiative-partitioner": {
                natural20Duplicate: true,
                originalId: updatedCombatant.id
              }
            }
          }], { fromPartition: true });
          
          console.log(`Initiative Partitioner | Created natural 20 duplicate with initiative ${highestInitiative}`);
        } catch (error) {
          console.error(`Initiative Partitioner | Error creating natural 20 duplicate:`, error);
        }
      }
    }
  }
});

/**
 * Hook into combat creation to handle initial initiative rolls
 */
Hooks.on("createCombatant", async (combatant, options, userId) => {
  if (!game.settings.get("initiative-partitioner", "enabled")) {
    return;
  }

  // Check if this is a user-initiated creation (not from our module)
  if (options.fromPartition) {
    return;
  }

  // Skip if this is already a partition or natural 20 duplicate
  if (isPartition(combatant) || combatant.flags?.["initiative-partitioner"]?.natural20Duplicate === true) {
    return;
  }

  let targetInitiative = game.settings.get("initiative-partitioner", "targetInitiative");
  let partitionCount = game.settings.get("initiative-partitioner", "partitionCount");
  let partitionOffset = game.settings.get("initiative-partitioner", "partitionOffset");

  // Check if the initiative is greater than or equal to the target value
  if (combatant.initiative >= targetInitiative) {
    let rolledInitiative = combatant.initiative;
    console.log(`Initiative Partitioner | Detected initiative ${rolledInitiative} (>= ${targetInitiative}) on creation for ${combatant.name}`);
    
    let combat = combatant.combat;
    if (!combat) {
      return;
    }

    // Wait a bit to ensure the original creation completes
    await new Promise(resolve => setTimeout(resolve, 100));

    // Create additional combatant entries
    let combatantData = combatant.toObject();
    
    // Remove fields that shouldn't be copied
    let { _id, sort, ...cleanData } = combatantData;
    
    for (let i = 1; i < partitionCount; i++) {
      let newInitiative = rolledInitiative - (i * partitionOffset);
      
      if (newInitiative > 0) {
        try {
          await combat.createEmbeddedDocuments("Combatant", [{
            ...cleanData,
            initiative: newInitiative,
            flags: {
              ...(cleanData.flags || {}),
              "initiative-partitioner": {
                isPartition: true,
                originalId: combatant.id,
                partitionIndex: i
              }
            }
          }], { fromPartition: true });
          
          // Small delay between creations to avoid timing issues
          await new Promise(resolve => setTimeout(resolve, 50));
          
          console.log(`Initiative Partitioner | Created partition ${i} with initiative ${newInitiative}`);
        } catch (error) {
          console.error(`Initiative Partitioner | Error creating partition ${i}:`, error);
        }
      }
    }
  }

  // Special case: Natural 20 on Turn 1 - create duplicate token with highest initiative
  // Check if the d20 roll itself was 20, not just the total
  // Note: For createCombatant, we need to check if we can access roll data
  // Since roll data might not be available, we'll try to infer from the actor
  try {
    let actor = combatant.actor;
    if (actor) {
      let initiativeMod = actor.system?.attributes?.init?.total || 
                            actor.system?.abilities?.dex?.mod || 0;
      let otherMods = actor.system?.attributes?.init?.misc || 0;
      let totalMod = initiativeMod + otherMods;
      let calculatedRoll = combatant.initiative - totalMod;
    }
  } catch (e) {
    // If calculation fails, skip
  }
  
  if (d20Value === 20) {
    let combat = combatant.combat;
    if (!combat) {
      return;
    }

    // Check if it's turn 1 (round 1) of combat
    let isTurn1 = !combat.started || combat.round === 1;
    
    if (isTurn1) {
      // Wait for partitions to be created first (if any)
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Get the combatant again to find the highest initiative value
      let updatedCombatant = combat.combatants.get(combatant.id);
      if (!updatedCombatant) return;
      
      // Find all combatants with same original (including partitions)
      let allRelatedCombatants = combat.combatants.filter(c => 
        c.id === updatedCombatant.id || 
        c.flags?.["initiative-partitioner"]?.originalId === updatedCombatant.id
      );
      
      // Find the highest initiative value
      let highestInitiative = Math.max(...allRelatedCombatants.map(c => c.initiative || 0));
      
      // Check if we already created a natural 20 duplicate
      let hasNatural20Duplicate = allRelatedCombatants.some(c => 
        c.flags?.["initiative-partitioner"]?.natural20Duplicate === true
      );
      
      if (!hasNatural20Duplicate && highestInitiative > 0) {
        console.log(`Initiative Partitioner | Natural 20 on Turn 1! Creating duplicate with initiative ${highestInitiative}`);
        
        try {
          let combatantData = updatedCombatant.toObject();
          // Remove fields that shouldn't be copied
          let { _id, sort, ...cleanData } = combatantData;
          
          await combat.createEmbeddedDocuments("Combatant", [{
            ...cleanData,
            initiative: highestInitiative,
            flags: {
              ...(cleanData.flags || {}),
              "initiative-partitioner": {
                natural20Duplicate: true,
                originalId: updatedCombatant.id
              }
            }
          }], { fromPartition: true });
          
          console.log(`Initiative Partitioner | Created natural 20 duplicate with initiative ${highestInitiative}`);
        } catch (error) {
          console.error(`Initiative Partitioner | Error creating natural 20 duplicate:`, error);
        }
      }
    }
  }
});

/**
 * Clean up partitions when combat ends or is deleted
 */
Hooks.on("deleteCombat", async (combat, options, userId) => {
  // Partitions will be automatically deleted with the combat, so no cleanup needed
  console.log("Initiative Partitioner | Combat deleted, partitions cleaned up automatically");
});
