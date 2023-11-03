export default function lazyGroupBy<K, T>(
    items: Iterable<T>,
    keySelector: (item: T) => K
): LazilyGrouped<K, T> {
    return new LazilyGrouped(items, keySelector);
}

export class LazilyGrouped<K, T> implements Iterable<[key: K, group: Iterable<T>]> {
    private readonly groups: Map<K, Iterable<T>> = new Map();
    private readonly groupGenerator: Iterator<[key: K, group: Iterable<T>]>;
    private iterateGroupGenerator(): Iterable<[key: K, group: Iterable<T>]> {
        const self = this;
        return Itmod.from(function* () {
            for (const entry of wrapIterator(self.groupGenerator)) {
                self.groups.set(entry[0], entry[1]);
                yield entry;
            }
        });
    }

    public *[Symbol.iterator]() {
        yield* this.groups;
        yield* this.iterateGroupGenerator();
    }

    public constructor(items: Iterable<T>, keySelector: (item: T) => K) {
        this.groupGenerator = lazyGroupBy_helper(items, keySelector)[
            Symbol.iterator
        ]();
    }
    
    public getGroup(key: K) {
        const group = this.groups.get(key);
        if (group !== undefined) {
            return group;
        } else {
            for (const [groupKey, group] of this.iterateGroupGenerator()) {
                if (groupKey === key) {
                    return group;
                }
            }
        }
        return undefined;
    }
}


function tuple<Items extends readonly any[]>(...items: Items): [...Items] {
    return items as [...Items];
}

function lazyGroupBy_helper<K, T>(
    items: Iterable<T>,
    keySelector: (item: T) => K
): Iterable<[key: K, group: Iterable<T>]> {
    return Itmod.from(function* () {
        const itemQueues = new Map<K, LinkedList<T>>();
        /** Keys to groups that have not yet been yielded. */
        const keyQueue = new LinkedList<K>();
        const iter = items[Symbol.iterator]();

        keyGenerator: while (true) {
            // check key queue
            const keyNode = keyQueue.popNode();

            if (keyNode !== undefined) {
                const key = keyNode.value;

                yield getGroup(key);
                continue keyGenerator;
            }

            // find next key
            for (const item of wrapIterator(iter)) {
                const itemKey = keySelector(item);

                /** the group cache that the item belongs to and that the key indexes */
                let itemQueue = itemQueues.get(itemKey);

                // does the group cache exist? if it does, the key has already been added to the keyCache or yielded
                if (itemQueue !== undefined) {
                    // add the item to the group cache and continue looking for the next key
                    itemQueue.unshift(item);
                } else {
                    // if it does not, create it and add the item to it
                    itemQueue = new LinkedList<T>();
                    itemQueue.unshift(item);
                    itemQueues.set(itemKey, itemQueue);

                    // also

                    // the key has not been yielded or added to the queue yet
                    // so add the key to the queue and go back up to the top
                    yield getGroup(itemKey);
                    continue keyGenerator;
                }
            }

            // main list has been exhausted without finding a new key, key generator loop is complete
            break;
        }

        function getGroup(key: K) {
            return tuple(
                key,
                Itmod.from(function* () {
                    // get the appropriate item queue
                    let itemQueue = itemQueues.get(key);

                    // this if statement should never come out true.
                    // because, at this point, the itemQueue should already exist as that is the indicator
                    // that the key has been yielded or added to the key queue and this function should never
                    // be called if that hasn't happened
                    if (itemQueue === undefined) {
                        itemQueue = new LinkedList<T>();
                        itemQueues.set(key, itemQueue);
                    }

                    itemGenerator: while (true) {
                        // check item queue
                        const itemNode = itemQueue.popNode();
                        if (itemNode !== undefined) {
                            yield itemNode.value;
                            continue itemGenerator;
                        }

                        // find more items
                        for (const item of wrapIterator(iter)) {
                            const itemKey = keySelector(item);

                            // does item belong to group?
                            if (itemKey === key) {
                                // yes, yield it and continue from the top
                                yield item;
                                continue itemGenerator;
                            } else {
                                // no, queue it for the group it does belong to and keep looking
                                let itemQueue = itemQueues.get(itemKey);
                                if (itemQueue === undefined) {
                                    keyQueue.unshift(itemKey);
                                    itemQueue = new LinkedList<T>();
                                    itemQueue.unshift(item);
                                    itemQueues.set(itemKey, itemQueue);
                                }
                            }
                        }

                        // main list has been exhausted without finding another item, item generator for this group is complete
                        break itemGenerator;
                    }
                })
            );
        }
    });
}
