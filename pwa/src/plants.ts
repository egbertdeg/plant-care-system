export interface PlantDef {
  id: number
  label: string
  name: string
  shortName: string
  dead?: boolean
}

export const PLANTS: PlantDef[] = [
  { id: 1,  label: 'O1',  name: 'Morden Blush Shrub Rose',       shortName: 'Morden Blush'  },
  { id: 2,  label: 'O2',  name: 'Lemon Burst Floribunda',         shortName: 'Lemon Burst',   dead: true },
  { id: 3,  label: 'O3',  name: 'Snowcone Shrub Rose',            shortName: 'Snowcone'      },
  { id: 4,  label: 'O4',  name: 'Mardi Gras Floribunda',          shortName: 'Mardi Gras'    },
  { id: 5,  label: 'O5',  name: 'Earth Angel Parfuma',            shortName: 'Earth Angel'   },
  { id: 6,  label: 'O6',  name: 'Unknown Yellow-White Rose',      shortName: 'Yellow-White'  },
  { id: 7,  label: 'O7',  name: 'Moondance Floribunda',           shortName: 'Moondance'     },
  { id: 8,  label: 'O8',  name: 'Bubblicious Shrub Rose',         shortName: 'Bubblicious'   },
  { id: 9,  label: 'O9',  name: 'Moondance Floribunda',           shortName: 'Moondance'     },
  { id: 10, label: 'O10', name: 'Mardi Gras Floribunda',          shortName: 'Mardi Gras'    },
]

export const ACTIVE_PLANTS = PLANTS.filter(p => !p.dead)
