/** All interface strings (Russian). */
export const STR = {
  title: 'Glimmerstones',
  subtitle: 'мерцающие камни',
  level: (n: number) => `Уровень ${n}`,
  undo: 'Отменить',
  restart: 'Заново',
  addShelf: 'Полочка',
  prevLevel: 'Предыдущий уровень',
  nextLevel: 'Следующий уровень',
  winTitle: 'Чудесно!',
  winText: (n: number) => `Уровень ${n} собран.`,
  next: 'Дальше',
  stuckTitle: 'Места не осталось',
  stuckText: 'Свободных ячеек больше нет. Ничего страшного — всё можно поправить.',
  stuckUndo: 'Отменить ход',
  stuckShelf: 'Добавить полочку',
  stuckRestart: 'Начать заново',
} as const;
